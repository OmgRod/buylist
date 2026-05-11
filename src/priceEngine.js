// priceEngine.js

const EXTRACTORS = [];

/* =========================
   CURRENCY & EXCHANGE RATES
========================= */

export let EXCHANGE_RATES = {
  USD: 1,
  EUR: 0.92,
  GBP: 0.79
};

export async function updateExchangeRates() {
  try {
    const response = await fetch('https://open.er-api.com/v6/latest/USD');
    if (response.ok) {
      const data = await response.json();
      if (data.rates) {
        EXCHANGE_RATES = data.rates;
        console.log('[PriceEngine] Rates updated');
        return data.rates;
      }
    }
  } catch (err) {
    console.error('[PriceEngine] API failed', err);
  }
  return EXCHANGE_RATES;
}

// Initial update
updateExchangeRates();

export function convertPrice(amount, from, to) {
  if (!amount || from === to) return amount;
  
  const fromRate = EXCHANGE_RATES[from];
  const toRate = EXCHANGE_RATES[to];
  
  if (!fromRate || !toRate) return amount;
  
  // Convert to USD first, then to target
  const inUSD = amount / fromRate;
  return inUSD * toRate;
}

/* =========================
   EXTRACTOR REGISTRATION
========================= */

function registerExtractor(extractor) {
  EXTRACTORS.push(extractor);
}

/* =========================
   UTILITIES
========================= */

function normalizePrice(text) {
  if (!text) return null;

  const cleaned = text
    .replace(/,/g, '.')
    .replace(/[^\d.]/g, '');

  const match = cleaned.match(/\d+(\.\d+)?/);

  if (!match) return null;

  return parseFloat(match[0]);
}

function parseHTML(html) {
  return new DOMParser().parseFromString(
    html,
    'text/html'
  );
}

async function fetchHTML(url) {
  try {
    // Amazon and other major retailers block direct automated requests and require CORS.
    // We use a CORS proxy (allorigins) to bypass these restrictions.
    const proxyUrl = `https://api.allorigins.win/get?disableCache=true&url=${encodeURIComponent(url)}`;

    const response = await fetch(proxyUrl);

    if (!response.ok) {
      throw new Error(`Proxy HTTP ${response.status}`);
    }

    const data = await response.json();
    
    if (!data || !data.contents) {
      throw new Error('Proxy returned empty content');
    }

    // Check if we got a 503/403 block page even through the proxy
    if (data.contents.includes('Service Unavailable Error') || data.contents.includes('api-services-support@amazon.com')) {
      console.warn(`[PriceEngine] Amazon block detected for ${url}`);
      return null;
    }

    return data.contents;
  } catch (err) {
    console.error(
      `[PriceEngine] Failed to fetch ${url}`,
      err
    );

    return null;
  }
}

function detectCurrency(text) {
  if (!text) return 'USD';

  if (text.includes('£')) return 'GBP';
  if (text.includes('€')) return 'EUR';
  if (text.includes('$')) return 'USD';

  return 'USD';
}

/* =========================
   GENERIC HTML EXTRACTOR
========================= */

function genericExtractor(html) {
  const doc = parseHTML(html);

  // 1. Try Metadata/Structured Data
  const metadataSelectors = [
    'meta[property="product:price:amount"]',
    'meta[property="og:price:amount"]',
    'meta[property="price:amount"]',
    'meta[name="twitter:data1"]',
    'script[type="application/ld+json"]'
  ];

  for (const selector of metadataSelectors) {
    const el = doc.querySelector(selector);
    if (!el) continue;

    let text = el.getAttribute('content') || el.textContent;

    // Special handling for JSON-LD
    if (selector.includes('json')) {
      try {
        const json = JSON.parse(text);
        // JSON-LD can be an object or an array
        const findPrice = (obj) => {
          if (obj.price) return obj.price;
          if (obj.offers) {
            if (Array.isArray(obj.offers)) return obj.offers[0].price;
            return obj.offers.price;
          }
          return null;
        };
        const price = Array.isArray(json) ? findPrice(json[0]) : findPrice(json);
        if (price) return { success: true, price: normalizePrice(String(price)), currency: detectCurrency(text), source: 'json-ld' };
      } catch (e) { continue; }
    }

    const price = normalizePrice(text);
    if (price) return { success: true, price, currency: detectCurrency(text), source: selector };
  }

  // 2. Try Common Class Names & IDs
  const commonSelectors = [
    '[itemprop="price"]',
    '.price',
    '.product-price',
    '.current-price',
    '.sale-price',
    '.special-price',
    '#price-block',
    '#price_inside_buybox',
    '.amount',
    '[data-price]',
    '[data-product-price]',
    '.largePriceTable td strong' // Added from image
  ];

  for (const selector of commonSelectors) {
    const elements = doc.querySelectorAll(selector);
    for (const el of elements) {
      const text = el.getAttribute('content') || el.getAttribute('data-price') || el.textContent;
      const price = normalizePrice(text);
      if (price) return { success: true, price, currency: detectCurrency(text), source: selector };
    }
  }

  // 3. Last Resort: Regex search in body text
  const bodyText = doc.body.textContent;
  const priceRegex = /([£$€])\s?(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2}))/g;
  let match;
  const candidates = [];
  while ((match = priceRegex.exec(bodyText)) !== null) {
    candidates.push({ price: normalizePrice(match[2]), currency: detectCurrency(match[1]) });
  }

  if (candidates.length > 0) {
    // Usually the largest or first valid price is the main one, but this is fuzzy
    return { success: true, price: candidates[0].price, currency: candidates[0].currency, source: 'regex-fallback' };
  }

  return { success: false };
}

/* =========================
   SHOPIFY EXTRACTOR
========================= */

async function shopifyExtractor(url) {
  try {
    const clean =
      url.split('?')[0].replace(/\/$/, '');

    const jsonURL = `${clean}.json`;

    const response = await fetch(jsonURL);

    if (!response.ok) {
      return {
        success: false
      };
    }

    const data = await response.json();

    const variant =
      data.product?.variants?.[0];

    if (!variant) {
      return {
        success: false
      };
    }

    return {
      success: true,
      price: parseFloat(variant.price),
      currency:
        variant.currency ||
        variant.price_currency ||
        'USD',
      source: 'shopify-json'
    };
  } catch {
    return {
      success: false
    };
  }
}

/* =========================
   AMAZON EXTRACTOR
========================= */

function amazonExtractor(html) {
  const doc = parseHTML(html);

  // 1. Try to find the full price block
  const priceContainer = doc.querySelector('.a-price');
  if (priceContainer) {
    // Try offscreen first (cleanest string)
    const offscreen = priceContainer.querySelector('.a-offscreen');
    if (offscreen && offscreen.textContent.trim()) {
      const price = normalizePrice(offscreen.textContent);
      if (price) return { success: true, price, currency: detectCurrency(offscreen.textContent), source: 'amazon-a-offscreen' };
    }

    // fallback to components if offscreen is empty or missing
    const whole = priceContainer.querySelector('.a-price-whole');
    const fraction = priceContainer.querySelector('.a-price-fraction');
    const symbol = priceContainer.querySelector('.a-price-symbol');

    if (whole) {
      let priceStr = whole.textContent.replace(/[^\d]/g, '');
      if (fraction) priceStr += '.' + fraction.textContent.replace(/[^\d]/g, '');
      
      const price = parseFloat(priceStr);
      if (!isNaN(price)) {
        return {
          success: true,
          price,
          currency: detectCurrency(symbol?.textContent || '£'),
          source: 'amazon-components'
        };
      }
    }
  }

  const selectors = [
    // Global/Modern Selectors
    '.a-price .a-offscreen',
    '.apexPriceToPay .a-offscreen',
    '#price_inside_buybox',
    '#corePrice_feature_div .a-offscreen',
    '#corePriceDisplay_desktop_feature_div .a-offscreen',
    
    // UK/International Specifics
    '#priceblock_ourprice',
    '#priceblock_dealprice',
    '#priceblock_saleprice',
    
    // Fallbacks
    '.a-color-price',
    'span[id^="priceblock_"]'
  ];

  for (const selector of selectors) {
    const el = doc.querySelector(selector);
    if (!el) continue;

    const text = el.textContent;
    const price = normalizePrice(text);

    if (price) {
      return {
        success: true,
        price,
        currency: detectCurrency(text),
        source: `amazon-${selector}`
      };
    }
  }

  // If Amazon specific fails, try generic as it might catch JSON-LD or meta tags
  return genericExtractor(html);
}

/* =========================
   EBAY EXTRACTOR
========================= */

function ebayExtractor(html) {
  const doc = parseHTML(html);

  const selectors = [
    '.x-price-primary',
    '.ux-textspans--BOLD',
    '[itemprop="price"]'
  ];

  for (const selector of selectors) {
    const el = doc.querySelector(selector);

    if (!el) continue;

    const text = el.textContent;

    const price = normalizePrice(text);

    if (price) {
      return {
        success: true,
        price,
        currency: detectCurrency(text),
        source: selector
      };
    }
  }

  return {
    success: false
  };
}

/* =========================
   CPC / FARNELL STYLE EXTRACTOR
========================= */

function cpcExtractor(html) {
  const doc = parseHTML(html);
  
  // Specific selector from the user image
  const el = doc.querySelector('#pricePanel .largePriceTable td strong') || 
             doc.querySelector('.largePriceTable td strong');
             
  if (el) {
    const text = el.textContent;
    const price = normalizePrice(text);
    if (price) {
      return {
        success: true,
        price,
        currency: detectCurrency(text),
        source: 'cpc-largePriceTable'
      };
    }
  }
  
  return genericExtractor(html);
}

/* =========================
   REGISTER EXTRACTORS
========================= */

registerExtractor({
  name: 'Shopify',
  test: (url) =>
    url.includes('/products/'),

  extract: async (url) => {
    return await shopifyExtractor(url);
  }
});

registerExtractor({
  name: 'Amazon',
  test: (url) =>
    url.includes('amazon.'),

  extract: async (url, html) => {
    return amazonExtractor(html);
  }
});

registerExtractor({
  name: 'eBay',
  test: (url) =>
    url.includes('ebay.'),

  extract: async (url, html) => {
    return ebayExtractor(html);
  }
});

registerExtractor({
  name: 'CPC/Farnell',
  test: (url) =>
    url.includes('cpc.farnell.com') || url.includes('farnell.com'),

  extract: async (url, html) => {
    return cpcExtractor(html);
  }
});

registerExtractor({
  name: 'Generic',
  test: () => true,

  extract: async (url, html) => {
    return genericExtractor(html);
  }
});

/* =========================
   MAIN SINGLE PRICE FETCH
========================= */

export async function getPrice(url) {
  try {
    let html = null;

    const extractor =
      EXTRACTORS.find((e) =>
        e.test(url)
      ) || EXTRACTORS.at(-1);

    // Shopify JSON doesn't need HTML
    if (extractor.name !== 'Shopify') {
      html = await fetchHTML(url);

      if (!html) {
        return {
          success: false,
          reason: 'fetch-failed'
        };
      }
    }

    const result =
      await extractor.extract(url, html);

    return {
      ...result,
      extractor: extractor.name,
      url
    };
  } catch (err) {
    console.error(err);

    return {
      success: false,
      reason: 'unknown-error',
      url
    };
  }
}

/* =========================
   MULTI-MIRROR COMPARISON
========================= */

export async function comparePrices(
  links = []
) {
  const results = await Promise.all(
    links.map(async (link) => {
      // If we have a URL, prioritize scraping it
      if (link.url) {
        const result = await getPrice(link.url);
        if (result.success) {
          return {
            label: link.label || 'Store',
            url: link.url,
            ...result
          };
        }
      }

      // If scraping fails or no URL, fall back to the manually entered price
      if (link.price && !isNaN(parseFloat(link.price))) {
        return {
          label: link.label || 'Store',
          url: link.url,
          success: true,
          price: parseFloat(link.price),
          source: 'manual'
        };
      }

      return {
        label: link.label || 'Store',
        url: link.url,
        success: false,
        reason: link.url ? 'fetch-failed' : 'no-url'
      };
    })
  );

  const valid = results.filter(
    (r) =>
      r.success &&
      typeof r.price === 'number'
  );

  const cheapest =
    valid.length > 0
      ? valid.reduce((a, b) =>
          a.price < b.price ? a : b
        )
      : null;

  return {
    success: valid.length > 0,

    prices: results,

    cheapest: cheapest
      ? {
          label: cheapest.label,
          price: cheapest.price,
          currency:
            cheapest.currency,
          url: cheapest.url
        }
      : null
  };
}

/* =========================
   REFRESH ALL ITEMS
========================= */

export async function refreshItems(
  items,
  setItems,
  setRefreshing
) {
  setRefreshing(true);

  try {
    const updated = await Promise.all(
      items.map(async (item) => {
        const comparison =
          await comparePrices(
            item.links
          );

        return {
          ...item,

          priceData:
            comparison.prices,

          cheapestPrice:
            comparison.cheapest
              ?.price || null,

          cheapestVendor:
            comparison.cheapest
              ?.label || null,

          currency:
            comparison.cheapest
              ?.currency || 'USD',

          lastChecked:
            new Date().toISOString()
        };
      })
    );

    setItems(updated);
  } catch (err) {
    console.error(err);
  }

  setRefreshing(false);
}

/* =========================
   OPTIONAL HELPERS
========================= */

export function formatPrice(
  value,
  currency = 'USD'
) {
  if (value == null || isNaN(parseFloat(value))) return '—';

  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  } catch (e) {
    // Fallback if currency code is invalid
    return `${currency} ${Number(value).toFixed(2)}`;
  }
}

/* =========================
   DEBUG
========================= */

window.PriceEngine = {
  getPrice,
  comparePrices,
  refreshItems
};