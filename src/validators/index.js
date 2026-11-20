import js from './js.js';
import ts from './ts.js';
import json from './json.js';
import html from './html.js';
import css from './css.js';
import yaml from './yaml.js';
import python from './python.js';
import php from './php.js';
import ruby from './ruby.js';
import go from './go.js';
import generic from './generic.js';

const REGISTRY = {
  js, mjs: js, cjs: js, jsx: js,
  ts, tsx: ts,
  json, jsonc: json,
  html, htm: html, vue: html,
  css, scss: css, less: css,
  yaml, yml: yaml,
  py: python,
  php,
  rb: ruby,
  go,
};

export function validatorFor(path) {
  const ext = String(path).split('.').pop().toLowerCase();
  return REGISTRY[ext] || generic;
}

export function validateFile(path, content) {
  const fn = validatorFor(path);
  try { return fn(content); }
  catch (e) { return { status: 'failed', detail: `validator threw: ${e.message}` }; }
}

export function summarize(results) {
  const clean = results.every((r) => r.status === 'ok');
  const notPerformed = results.filter((r) => r.status === 'NOT_PERFORMED').length;
  const failed = results.filter((r) => r.status === 'failed').length;
  return { clean, notPerformed, failed, total: results.length };
}
