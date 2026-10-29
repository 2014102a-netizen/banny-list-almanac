export const MEDIA = {
  leaf: `${import.meta.env.BASE_URL}leaf.svg`,
  birthday: `${import.meta.env.BASE_URL}images/banny-list-birthday-2026.jpg`,
};
export function eventImage(event) {
  return /^https:\/\//i.test(event?.imageUrl || '') ? event.imageUrl : '';
}
