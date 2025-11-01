export const generateRandomNumbers = (length: number) => {
  const charset = '0123456789';
  let randomString = '';

  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * charset.length);
    randomString += charset.charAt(randomIndex);
  }

  return randomString;
}

export const generateInviteCode = (length = 6) => {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let inviteCode = '';

  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * characters.length);
    inviteCode += characters[randomIndex];
  }

  return inviteCode;
}

export function generateRandomString(length: any) {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const charactersLength = characters.length;

  // Generate random characters using Array.from and map
  const inviteCode = Array.from({ length }, () => characters[Math.floor(Math.random() * charactersLength)]).join('');

  return inviteCode;
}

export const isFloat = (n: any) => {
  return Number(n) === n && n % 1 !== 0;
};

export const toFixed = (price: string | number) => {
  return parseFloat(Number(price).toFixed(2))
}

export const currencyFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
});
