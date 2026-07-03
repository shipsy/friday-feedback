// Emits /robots.txt disallowing all crawlers (this app must never be indexed).
export default function robots() {
  return {
    rules: {
      userAgent: '*',
      disallow: '/',
    },
  };
}
