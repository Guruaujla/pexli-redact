import { describe, expect, it } from 'vitest';
import { personalHint } from '../personal-hint';

describe('personal field hints', () => {
  it.each([
    'Name',
    'Full name',
    'firstName',
    'last_name',
    'customer-name',
    'Cardholder name',
    'Surname',
    'Street address',
    'billing_address_line1',
    'ZIP',
    'Postal code',
    'Date of birth',
    'dob',
    'Birthday',
    'user[first_name]',
    'Vorname',
    'Nachname',
    'Anschrift',
    'Nombre',
    'Apellidos',
    'Dirección',
    'Prénom',
    'Code postal',
    'Nome',
    'Endereço',
    'Фамилия',
    'Адрес',
    '姓名',
    '地址',
    'First name | user-name-field',
  ])('treats "%s" as personal', (hint) => {
    expect(personalHint(hint)).toBe(true);
  });

  it.each([
    'Username',
    'Company name',
    'File name',
    'Email address',
    'IP address',
    'Project name',
    'Workspace name',
    'Search',
    '',
    'Product',
    'Display Name',
    'Variable name',
    'New name',
    "Nom d'utilisateur",
    'Nombre de la empresa',
    'field-:r2:',
    'Company name | name',
  ])('leaves "%s" alone', (hint) => {
    expect(personalHint(hint)).toBe(false);
  });

  it('trusts autocomplete first', () => {
    expect(personalHint('x1', 'shipping street-address')).toBe(true);
    expect(personalHint('x1', 'bday')).toBe(true);
    expect(personalHint('Name', 'username')).toBe(false);
    expect(personalHint('Name', 'organization')).toBe(false);
    expect(personalHint('Name', 'off')).toBe(true);
    expect(personalHint('x1', 'cc-name')).toBe(true);
    expect(personalHint('Name on card', 'cc-number')).toBe(false);
  });
});
