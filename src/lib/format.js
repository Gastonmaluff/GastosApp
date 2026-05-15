export const formatGs = (value = 0) => {
  const number = Number.isFinite(Number(value)) ? Number(value) : 0;
  return `Gs ${Math.round(number).toLocaleString("es-PY")}`;
};

export const todayISO = () => new Date().toISOString().slice(0, 10);

export const sameMonth = (dateValue, reference = new Date()) => {
  const date = new Date(dateValue);
  return (
    date.getFullYear() === reference.getFullYear() &&
    date.getMonth() === reference.getMonth()
  );
};

export const categoryKey = (category = "") =>
  category.toLowerCase().includes("gomita") ? "gomitas" : "edredones";
