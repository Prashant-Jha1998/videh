const packages = ["com.traya.prod", "com.instagram.android", "com.example.messenger"];

function formatReviewCount(count) {
  if (!Number.isFinite(count) || count <= 0) return "";
  if (count >= 1_000_000) {
    const m = count / 1_000_000;
    const label = m >= 10 ? `${Math.round(m)}M` : `${m.toFixed(1).replace(/\.0$/, "")}M`;
    return `${label} reviews`;
  }
  if (count >= 1_000) return `${Math.round(count / 1_000)}K reviews`;
  return `${count} reviews`;
}

for (const id of packages) {
  const url = `https://play.google.com/store/apps/details?id=${id}&hl=en&gl=IN`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0 Safari/537.36",
      "Accept-Language": "en-IN,en;q=0.9",
    },
  });
  const html = await res.text();
  const re = /<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  const m = re.exec(html);
  const app = m ? JSON.parse(m[1]) : null;
  const installs = html.match(/<div class="ClM7O">([^<]+)<\/div>\s*<div class="g1rdde">Downloads<\/div>/i);
  const rating = app?.aggregateRating?.ratingValue;
  const count = app?.aggregateRating?.ratingCount;
  console.log(id, {
    title: app?.name?.slice(0, 40),
    rating: rating != null ? Math.round(Number(rating) * 10) / 10 : null,
    reviews: count ? formatReviewCount(Number(count)) : null,
    installs: installs?.[1],
    category: app?.applicationCategory,
  });
}
