// COPIED from rotech-semiannual/src/utils/submissionView.js (imports adapted).
// Turns a saved assessment document into a flat, render-agnostic outline that
// both the on-screen review (SubmissionReview.jsx) and the PDF export
// (submissionPdf.js) walk, so the two never drift apart.
//
// Block shapes:
//   { type: 'heading',    text }
//   { type: 'subheading', text }
//   { type: 'fields',     rows: [{ label, value }] }
//   { type: 'table',      columns: [..], rows: [{ cells: [..], tone }] }
//   { type: 'note',       text }
// tone: 'positive' | 'negative' | 'neutral' | 'warning'

import {
  FACILITY_REVIEW_SECTIONS,
  WAREHOUSE_REVIEW_SECTIONS,
  VEHICLE_SECTIONS,
  OP512_ITEMS,
  JC427_SECTIONS,
  NON_CLINICAL_COMPETENCIES,
  CLINICAL_COMPETENCIES,
  ROLE_TYPE_LABELS,
  getExpirationStatus,
  resolveJobTitle,
} from './readinessForms';

export const FORM_NAMES = {
  OP541: 'OP 541',
  OP512: 'OP 512',
  JC427: 'JC 427',
};

export const FORM_TITLES = {
  OP541: 'Facility Readiness Assessment',
  OP512: 'Facility Safety Inspection',
  JC427: 'Personnel Records Review',
};

const YES_NO_LABELS = {
  yes: { label: 'Yes', tone: 'positive' },
  no: { label: 'No', tone: 'negative' },
  na: { label: 'N/A', tone: 'neutral' },
};

const COMPLETE_LABELS = {
  complete: { label: 'Complete', tone: 'positive' },
  incomplete: { label: 'Incomplete', tone: 'negative' },
  na: { label: 'N/A', tone: 'neutral' },
};

const EXPIRATION_LABELS = {
  green: { label: 'Current', tone: 'positive' },
  yellow: { label: 'Expires within 6 months', tone: 'warning' },
  red: { label: 'Expired', tone: 'negative' },
};

function answer(value, labels) {
  return labels[value] || { label: value ? String(value) : 'Not answered', tone: 'neutral' };
}

// Firestore Timestamp, a plain Date, or nothing at all.
export function toDate(value) {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate();
  if (value instanceof Date) return value;
  // Bare YYYY-MM-DD strings (the forms' date inputs) parse as UTC midnight,
  // which shows the prior day in western timezones - pin them to local time.
  const parsed = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00`)
    : new Date(value);
  return isNaN(parsed.getTime()) ? null : parsed;
}

export function formatDate(value) {
  const date = toDate(value);
  return date ? date.toLocaleDateString() : '—';
}

// YYYY-MM-DD, in local time, for the PDF file name.
export function formatDateForFileName(value) {
  const date = toDate(value) || new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function checklistTable(items, responses, labels) {
  return {
    type: 'table',
    columns: ['Item', 'Response'],
    rows: items.map((item) => {
      const { label, tone } = answer((responses || {})[item.id], labels);
      return { cells: [item.label, label], tone };
    }),
  };
}

function sectionBlocks(sections, responses, labels) {
  return Object.entries(sections).flatMap(([sectionKey, section]) => ([
    { type: 'subheading', text: section.title },
    checklistTable(section.items, (responses || {})[sectionKey], labels),
  ]));
}

function competencyTable(items, values) {
  const filled = items.filter(item => (values || {})[item.id]);
  if (filled.length === 0) {
    return { type: 'note', text: 'No competency dates entered.' };
  }

  return {
    type: 'table',
    columns: ['Competency', 'Date', 'Status'],
    rows: filled.map((item) => {
      const date = values[item.id];
      const label = item.editableLabel ? (values[`${item.id}_label`] || item.label) : item.label;
      const status = EXPIRATION_LABELS[getExpirationStatus(date)] || { label: '—', tone: 'neutral' };
      return { cells: [label, formatDate(date), status.label], tone: status.tone };
    }),
  };
}

function op541Blocks(assessment) {
  const blocks = [
    { type: 'heading', text: 'Facility Review' },
    ...sectionBlocks(FACILITY_REVIEW_SECTIONS, assessment.facilityReview, YES_NO_LABELS),
  ];

  if (assessment.warehouseReview?.included) {
    blocks.push({ type: 'heading', text: 'Offsite Warehouse Review' });
    blocks.push(...sectionBlocks(WAREHOUSE_REVIEW_SECTIONS, assessment.warehouseReview, YES_NO_LABELS));
  } else {
    blocks.push({ type: 'heading', text: 'Offsite Warehouse Review' });
    blocks.push({ type: 'note', text: 'No offsite warehouse included in this assessment.' });
  }

  (assessment.vehicles || []).forEach((vehicle, i) => {
    blocks.push({ type: 'heading', text: `Vehicle ${i + 1}${vehicle.unitNumber ? ` — Unit ${vehicle.unitNumber}` : ''}` });
    blocks.push({
      type: 'fields',
      rows: [
        { label: 'Driver Name', value: vehicle.driverName || '—' },
        { label: 'Unit Number', value: vehicle.unitNumber || '—' },
      ],
    });
    blocks.push(...sectionBlocks(VEHICLE_SECTIONS, vehicle, YES_NO_LABELS));
  });

  return blocks;
}

function op512Blocks(assessment) {
  return [
    { type: 'heading', text: 'Facility Safety Inspection' },
    checklistTable(OP512_ITEMS, assessment.responses, YES_NO_LABELS),
  ];
}

function jc427Blocks(assessment) {
  return (assessment.employees || []).flatMap((employee, i) => {
    const jobTitle = employee.jobTitleResolved || resolveJobTitle(employee) || '—';
    const blocks = [
      { type: 'heading', text: `Employee ${i + 1}: ${employee.name || '—'}` },
      {
        type: 'fields',
        rows: [
          { label: 'Job Title', value: jobTitle },
          { label: 'Competency Track', value: ROLE_TYPE_LABELS[employee.roleType] || '—' },
          { label: 'Hire Date', value: formatDate(employee.hireDate) },
        ],
      },
    ];

    Object.values(JC427_SECTIONS).forEach((section) => {
      blocks.push({ type: 'subheading', text: section.title });
      blocks.push(checklistTable(section.items, employee.personnelRecord, COMPLETE_LABELS));
    });

    blocks.push({ type: 'subheading', text: 'Non-Clinical Competency Assessments' });
    blocks.push(competencyTable(NON_CLINICAL_COMPETENCIES, employee.nonClinicalCompetencies));
    blocks.push({ type: 'subheading', text: 'Clinical Competency Assessments' });
    blocks.push(competencyTable(CLINICAL_COMPETENCIES, employee.clinicalCompetencies));

    return blocks;
  });
}

const BLOCK_BUILDERS = {
  OP541: op541Blocks,
  OP512: op512Blocks,
  JC427: jc427Blocks,
};

// assessment: the Firestore document (plus id). locationName is optional and
// only used for the title line and the PDF file name.
export function buildSubmissionView(assessment, locationName) {
  const type = assessment?.assessmentType;
  const formName = FORM_NAMES[type] || type || 'Assessment';
  const build = BLOCK_BUILDERS[type];

  const meta = [
    { label: 'Location', value: locationName ? `${locationName} (${assessment.locationId})` : assessment.locationId },
    { label: 'Assessment Period', value: assessment.quarter || '—' },
    { label: 'Status', value: assessment.status === 'rejected' ? 'Rejected' : 'Submitted' },
    { label: 'Submitted', value: formatDate(assessment.submittedAt) },
  ];

  if (assessment.status === 'rejected' && assessment.rejectionReason) {
    meta.push({ label: 'Rejection Reason', value: assessment.rejectionReason });
  }

  const blocks = build ? build(assessment) : [{ type: 'note', text: 'No printable view is available for this form.' }];

  if (assessment.comments) {
    blocks.push({ type: 'heading', text: 'Notes' });
    blocks.push({ type: 'note', text: assessment.comments });
  }

  return {
    formName,
    formTitle: FORM_TITLES[type] || '',
    locationName: locationName || assessment.locationId,
    meta,
    blocks,
  };
}

// "Location_Form Name_Date Submitted.pdf" — e.g. "Beaverton_JC 427_2026-08-21.pdf"
export function submissionFileName(assessment, locationName) {
  const clean = (part) => String(part || '')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();

  const location = clean(locationName || assessment.locationId || 'Location');
  const formName = clean(FORM_NAMES[assessment.assessmentType] || assessment.assessmentType || 'Assessment');
  return `${location}_${formName}_${formatDateForFileName(assessment.submittedAt)}.pdf`;
}
