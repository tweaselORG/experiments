export const pause = (ms: number) => new Promise((res) => setTimeout(res, ms));

export const randomIndex = (count: number) => Math.floor(Math.random() * count);
