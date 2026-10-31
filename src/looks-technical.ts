const IP = /^(?:\d{1,3}(?:\.\d{1,3}){3}(?:\/\d{1,2})?|[\da-f]{0,4}(?::[\da-f]{0,4}){2,7})$/i;
const URL_LIKE = /^(?:[a-z][\w+.-]*:\/\/|www\.)\S+$/i;
const HOST = /^(?:[a-z\d-]+\.)+(?:com|net|org|io|dev|app|co|ai|cloud|local|internal|lan|ca|uk|de|fr|eu|us)$/i;
const FILE =
  /^[^/\\]+\.(?:pdf|docx?|xlsx?|pptx?|csv|tsv|txt|rtf|md|json|ya?ml|xml|html?|js|ts|tsx|jsx|py|rb|go|rs|java|sh|png|jpe?g|gif|svg|webp|heic|mp3|mp4|mov|wav|zip|tar|gz|7z|log|sql|ipynb)$/i;
const PATH = /^(?:~?\/|[a-z]:\\)\S*$/i;

export function looksTechnical(value: string): boolean {
  const text = value.trim();
  return [IP, URL_LIKE, HOST, FILE, PATH].some((shape) => shape.test(text));
}
