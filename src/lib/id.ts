export const uid = () => {
  // modern browsers: crypto.randomUUID exists
  // fallback for older
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: any = crypto as any;
  return c?.randomUUID ? c.randomUUID() : `${Date.now()}_${Math.random().toString(16).slice(2)}`;
};