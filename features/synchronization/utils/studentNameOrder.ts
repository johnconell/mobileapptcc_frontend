export type StructuredStudentName = {
  firstName?: string | null;
  middleName?: string | null;
  lastName?: string | null;
  id: number;
};

function normalized(value?: string | null): string {
  return String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

export function compareStudentNames(left: StructuredStudentName, right: StructuredStudentName): number {
  for (const field of ['lastName', 'firstName', 'middleName'] as const) {
    const comparison = normalized(left[field]).localeCompare(normalized(right[field]), undefined, {
      sensitivity: 'base',
      numeric: true,
    });
    if (comparison !== 0) return comparison;
  }
  return left.id - right.id;
}
