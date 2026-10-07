export function asset(path: string): string {
  const file = path.replace(/^\//, '');
  return `${import.meta.env.BASE_URL}${file}`;
}
