export function speciesName(name: string) {
  const special: Record<string, string> = {
    'nidoran-f': 'Nidoran ♀',
    'nidoran-m': 'Nidoran ♂',
    'mr-mime': 'Mr. Mime',
    farfetchd: 'Farfetch’d',
  };
  return special[name] ?? name.charAt(0).toUpperCase() + name.slice(1);
}
