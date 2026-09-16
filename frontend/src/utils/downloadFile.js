export const downloadFile = async (url, fallbackName) => {
  const response = await fetch(url);
  if (!response.ok) {
    const body = await response.text();
    let message = 'No fue posible generar el archivo.';
    try { message = JSON.parse(body).mensaje || message; } catch { /* Response is not JSON. */ }
    throw new Error(message);
  }

  const disposition = response.headers.get('content-disposition') || '';
  const encodedName = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  const plainName = disposition.match(/filename="?([^";]+)"?/i)?.[1];
  const fileName = encodedName ? decodeURIComponent(encodedName) : plainName || fallbackName;
  const objectUrl = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
};
