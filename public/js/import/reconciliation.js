import { el } from '../dom.js';

/** @typedef {import('../../../server/types/browser-models').ReconciliationProposal} ReconciliationProposal */

/** @param {readonly string[]} options @param {string} selected @param {Record<string, unknown>} attributes */
function choice(options, selected, attributes) {
  return el('select', attributes, ...options.map((option) => el('option', { value: option, selected: option === selected ? '' : null }, option.replaceAll('-', ' '))));
}

/** @param {ReconciliationProposal} proposal */
export function reconciliationPreview(proposal) {
  const entities = proposal.entityProposals.map((entity) => el('article', { class: 'card stack' },
    el('h3', {}, `${entity.entityType.replaceAll('_', ' ')} — ${entity.action}`),
    el('p', { class: 'muted' }, entity.sourceRecordKey),
    ...entity.fields.filter((fieldEntry) => fieldEntry.changed || fieldEntry.conflict || fieldEntry.ownership === 'review-required').map((fieldEntry) => el('label', { class: fieldEntry.conflict ? 'conflict' : '' },
      `${fieldEntry.fieldPath}: current ${JSON.stringify(fieldEntry.currentValue)} → source ${JSON.stringify(fieldEntry.sourceValue)}`,
      choice(['accept-source', 'keep-current', 'make-user-owned', 'return-to-source', 'defer'], fieldEntry.recommended, { 'data-field-decision': `${entity.proposalId}.${fieldEntry.fieldPath}` })))))
  ;
  const absences = proposal.absences.map((absence) => el('label', { class: 'card' }, `${absence.entityType.replaceAll('_', ' ')} ${absence.sourceRecordKey} is absent from the source`, choice(absence.choices, 'defer', { 'data-absence-decision': absence.proposalId })));
  const warnings = proposal.warnings.map((warning) => el('label', { class: warning.severity === 'blocking' ? 'conflict' : '' },
    el('input', { type: 'checkbox', 'data-warning-code': warning.code, disabled: warning.severity === 'blocking' ? null : '' }),
    `${warning.severity}: ${warning.code}${warning.count === null ? '' : ` (${warning.count})`}`));
  return el('div', { class: 'stack' }, ...warnings, ...entities, ...absences);
}

/** @param {ReconciliationProposal} proposal @param {HTMLElement} reconciliation */
export function approvalFromPreview(proposal, reconciliation) {
  const fieldDecisions = Object.fromEntries([...reconciliation.querySelectorAll('[data-field-decision]')].filter((control) => control instanceof HTMLSelectElement).map((control) => [control.getAttribute('data-field-decision'), control.value]));
  const absenceDecisions = Object.fromEntries([...reconciliation.querySelectorAll('[data-absence-decision]')].filter((control) => control instanceof HTMLSelectElement).map((control) => [control.getAttribute('data-absence-decision'), control.value]));
  const acknowledgeWarnings = [...reconciliation.querySelectorAll('[data-warning-code]:checked')].map((control) => control.getAttribute('data-warning-code'));
  return { schemaVersion: 'techsitemanager.io/import-approval/v1', draftHash: proposal.draftHash, targetVersions: proposal.targetVersions, fieldDecisions, absenceDecisions, acknowledgeWarnings };
}

/** @param {ReconciliationProposal} proposal */
export function approvalFromProposal(proposal) {
  return { schemaVersion: 'techsitemanager.io/import-approval/v1', draftHash: proposal.draftHash, targetVersions: proposal.targetVersions, fieldDecisions: {}, absenceDecisions: {}, acknowledgeWarnings: [] };
}

/** @param {ReconciliationProposal} proposal @param {{ singular: string, plural: string, childSingular: string, childPlural: string }} terms */
export function importOverview(proposal, terms) {
  const entities = proposal.entityProposals;
  /** @param {string} entityType */
  const count = (entityType) => entities.filter((entry) => entry.entityType === entityType).length;
  const circuits = entities.filter((entry) => entry.entityType === 'circuit');
  /** @param {string} media */
  const mediaCount = (media) => circuits.filter((entry) => entry.fields.some((field) => field.fieldPath === 'media' && field.sourceValue === media)).length;
  const conflicts = entities.reduce((total, entry) => total + entry.fields.filter((field) => field.conflict).length, 0);
  const changed = entities.filter((entry) => entry.action !== 'unchanged').length;
  const summary = proposal.summary;
  const stats = [
    [terms.childPlural, count('work_item')], ['Fibre', mediaCount('fibre')], ['Copper', mediaCount('copper')], ['DAC', mediaCount('dac')]
  ];
  const warnings = proposal.warnings.map((warning) => el('li', { class: warning.severity === 'blocking' ? 'error' : '' }, `${warning.code.replaceAll(/[._-]/g, ' ')}${warning.count === null ? '' : ` (${warning.count})`}`));
  return el('div', { class: 'stack import-overview' },
    el('div', { class: 'result-record' },
      el('strong', {}, summary?.packageReference || terms.singular),
      ...(summary?.title ? [el('span', {}, summary.title)] : []),
      ...(summary?.siteCode ? [el('span', { class: 'muted' }, `${summary.siteCode}${summary.siteName && summary.siteName !== summary.siteCode ? ` — ${summary.siteName}` : ''}`)] : [])),
    el('div', { class: 'summary-grid import-overview-stats' }, ...stats.map(([label, value]) => el('div', { class: 'summary-card' }, el('strong', {}, String(value)), el('span', {}, label)))),
    el('p', { class: 'muted' }, `${changed} record${changed === 1 ? '' : 's'} will be created or updated.${proposal.absences.length ? ` ${proposal.absences.length} absent source record${proposal.absences.length === 1 ? '' : 's'} will be left unchanged.` : ''}`),
    ...(conflicts ? [el('p', { class: 'notice notice-warn' }, `${conflicts} existing field${conflicts === 1 ? '' : 's'} differ from the source. Safe recommended values will be used.`)] : []),
    ...(warnings.length ? [el('div', {}, el('h3', {}, 'Import notes'), el('ul', { class: 'import-log' }, ...warnings))] : []));
}
