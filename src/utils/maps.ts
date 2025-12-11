export const getStreetMapEmbedUrl = (originalEmbedUrl: string): string => {
  try {
    const url = new URL(originalEmbedUrl);
    // Force normal map (not satellite)
    url.searchParams.set('layer', '');      // removes any existing layer
    url.searchParams.set('style', '');      // no custom style
    url.hash = '';                         // remove any #streetview
    return url.toString();
  } catch {
    // fallback – just strip any hash and add ?layer=
    const base = originalEmbedUrl.split('#')[0];
    return base + (base.includes('?') ? '&' : '?') + 'layer=';
  }
};