import fs from 'node:fs';

const load = (name) => fs.readFileSync(new URL(`./prompts/${name}.md`, import.meta.url), 'utf8').trim();

export const PROMPTS = {
  analyzer: load('analyzer'),
  localizer: load('localizer'),
  patcher: load('patcher'),
  critic: load('critic'),
};
