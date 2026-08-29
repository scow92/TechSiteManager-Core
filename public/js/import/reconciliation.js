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
