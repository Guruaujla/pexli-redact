const PERSONAL_AUTOCOMPLETE = new Set([
  'name',
  'honorific-prefix',
  'given-name',
  'additional-name',
  'family-name',
  'honorific-suffix',
  'nickname',
  'street-address',
  'address-line1',
  'address-line2',
  'address-line3',
  'address-level1',
  'address-level2',
  'address-level3',
  'address-level4',
  'postal-code',
  'bday',
  'bday-day',
  'bday-month',
  'bday-year',
  'cc-name',
  'cc-given-name',
  'cc-family-name',
]);
const OTHER_AUTOCOMPLETE =
  /^(?:username|organization|organization-title|email|tel|url|cc-|new-password|current-password|one-time-code)/;
const START = '(?<![\\p{L}\\p{N}])(?:';
const END = ')(?![\\p{L}\\p{N}])';
const NOT_A_PERSON = new RegExp(
  `${START}user|company|org|organi[sz]ation|business|file|filename|product|project|workspace|domain|host|hostname|server|app|account|team|group|field|column|table|event|item|brand|store|shop|role|plan|device|path|folder|bucket|repo|branch|tag|key|class|type|ip|mac|email|e mail|web|url|wallet|site|page|tab|list|bank|display|variable|new|resource|instance|cluster|database|db|function|service|queue|env|environment|node|pod|namespace|container|image|zone|region|vm|machine|network|dns|record|certificate|utilisateur|usuario|usuário|benutzer|пользователь|empresa|entreprise|société|firma|компания|fichier|archivo|arquivo|datei|файл|produit|producto|produto|produkt${END}|用户|公司|文件|产品|项目`,
  'u',
);
const PERSON_NAME = new RegExp(
  `${START}name|surname|forename|fname|lname|firstname|lastname|fullname|givenname|familyname|nickname|vorname|nachname|familienname|nombre|apellidos?|nom|prénom|nome|sobrenome|имя|фамилия|отчество|фио${END}|姓名|名字|姓氏`,
  'u',
);
const ADDRESS = new RegExp(
  `${START}address|street|addr|postcode|zip|zipcode|postal|postalcode|anschrift|adresse|straße|strasse|plz|postleitzahl|wohnort|dirección|direccion|calle|domicilio|código postal|codigo postal|rue|code postal|endereço|endereco|rua|cep|адрес|улица|индекс${END}|地址|邮编|邮政编码`,
  'u',
);
const BIRTHDAY = new RegExp(
  `${START}dob|birthday|birthdate|bday|date of birth|birth date|geburtsdatum|geburtstag|fecha de nacimiento|date de naissance|data de nascimento|дата рождения${END}|出生日期|生日`,
  'u',
);

function personalPart(part: string): boolean | undefined {
  const inner = /\[([^\]]+)\]$/.exec(part)?.[1] ?? part;
  const text = inner
    .replace(/(\p{Ll})(\p{Lu})/gu, '$1 $2')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .toLowerCase()
    .trim();
  if (!text || text.length > 80) return undefined;
  if (BIRTHDAY.test(text)) return true;
  if (!PERSON_NAME.test(text) && !ADDRESS.test(text)) return undefined;
  return !NOT_A_PERSON.test(text);
}

export function personalHint(hint: string, autocomplete = ''): boolean {
  const tokens = autocomplete.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.some((token) => PERSONAL_AUTOCOMPLETE.has(token))) return true;
  if (tokens.some((token) => OTHER_AUTOCOMPLETE.test(token))) return false;
  for (const part of hint.split('|')) {
    const verdict = personalPart(part);
    if (verdict !== undefined) return verdict;
  }
  return false;
}
