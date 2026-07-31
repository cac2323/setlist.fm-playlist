/** Client-side navigation helper (mockable in tests). */
export function navigateTo(url: string) {
  window.location.assign(url);
}
