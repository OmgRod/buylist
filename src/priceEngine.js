// priceEngine.js

const EXTRACTORS = [];

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
    const response = await fetch(url, {
      method: 'GET',
      mode: 'cors',
      headers: {
        Accept: 'text/html'
      }
    });

    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status}`
      );
    }

    return await response.text();
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

  const selectors = [
    'meta[property="product:price:amount"]',
    'meta[property="og:price:amount"]',
    'meta[name="twitter:data1"]',

    '[itemprop="price"]',

    '.price',
    '.product-price',
    '.current-price',
    '.sale-price',
    '.special-price',

    '[data-price]',
    '[data-product-price]'
  ];

  for (const selector of selectors) {
    const el = doc.querySelector(selector);

    if (!el) continue;

    const text =
      el.getAttribute('content') ||
      el.getAttribute('data-price') ||
      el.textContent;

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

  const selectors = [
    '.a-price .a-offscreen',
    '.a-price-whole',
    '#priceblock_ourprice',
    '#priceblock_dealprice'
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
      const result = await getPrice(
        link.url
      );

      return {
        label: link.label || 'Store',
        url: link.url,
        ...result
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
  if (value == null) return '—';

  const symbols = {
    USD: '$',
    GBP: '£',
    EUR: '€'
  };

  return `${
    symbols[currency] || '$'
  }${Number(value).toFixed(2)}`;
}

/* =========================
   DEBUG
========================= */

window.PriceEngine = {
  getPrice,
  comparePrices,
  refreshItems
};