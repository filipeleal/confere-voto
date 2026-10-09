export function createAnalytics(rawId = '') {
  const id = rawId.trim();
  if (id && !/^G-[A-Z0-9]+$/.test(id)) {
    throw new Error('GOOGLE_ANALYTICS_ID deve ter o formato G-XXXXXXXXXX');
  }
  return {
    enabled: Boolean(id),
    script: id ? `window.dataLayer = window.dataLayer || [];
window.gtag = function () { window.dataLayer.push(arguments); };
window.gtag('js', new Date());
window.gtag('config', ${JSON.stringify(id)}, {
  allow_google_signals: false,
  allow_ad_personalization_signals: false
});
const tag = document.createElement('script');
tag.async = true;
tag.src = 'https://www.googletagmanager.com/gtag/js?id=${id}';
document.head.appendChild(tag);
` : '',
    inject(html) {
      return id ? html.replace('</head>', '<script defer src="/analytics.js"></script>\n</head>') : html;
    },
    csp: "default-src 'self'; style-src 'self'; script-src 'self'" +
      (id ? ' https://www.googletagmanager.com' : '') +
      "; connect-src 'self'" +
      (id ? ' https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com' : '') +
      "; img-src 'self'" + (id ? ' https://*.google-analytics.com https://www.googletagmanager.com' : '') +
      "; base-uri 'none'; frame-ancestors 'none'",
  };
}
