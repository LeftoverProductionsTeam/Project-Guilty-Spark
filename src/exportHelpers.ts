/** Browser-only, user-initiated exports. Never writes into a Halo installation. */
export function downloadLocalText(filename:string, contents:string, type='text/plain;charset=utf-8') {
  downloadLocalBlob(filename, new Blob([contents], { type }));
}
export function downloadLocalBlob(filename:string, contents:Blob) {
  if (!/^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,100}$/.test(filename) || contents.size>48*1024*1024)
    throw new Error('Unsafe export filename or output size');
  const url=URL.createObjectURL(contents);
  const link=document.createElement('a');
  try {
    link.href=url;link.download=filename;link.rel='noopener';
    document.body.appendChild(link);link.click();
  } finally { link.remove();setTimeout(()=>URL.revokeObjectURL(url),2000); }
}
