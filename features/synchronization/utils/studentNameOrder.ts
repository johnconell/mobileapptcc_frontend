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

export function extractSurnameSortKey(student: {
  lastName?: string | null;
  fullName?: string | null;
  name?: string | null;
}): string {
  if (student.lastName && student.lastName.trim()) {
    return normalized(student.lastName);
  }
  const raw = (student.fullName || student.name || '').trim();
  if (raw.includes(',')) {
    return normalized(raw.split(',')[0]);
  }
  const parts = raw.split(/\s+/);
  return normalized(parts[parts.length - 1] || raw);
}

export function sortStudentsAlphabetical<
  T extends {
    id?: string | number;
    fullName?: string | null;
    name?: string | null;
    lastName?: string | null;
    firstName?: string | null;
  }
>(students: T[]): T[] {
  return [...students].sort((a, b) => {
    const aLast = extractSurnameSortKey(a);
    const bLast = extractSurnameSortKey(b);
    const cmpLast = aLast.localeCompare(bLast, undefined, { sensitivity: 'base', numeric: true });
    if (cmpLast !== 0) return cmpLast;
    const aFirst = normalized(a.firstName || a.fullName || a.name || '');
    const bFirst = normalized(b.firstName || b.fullName || b.name || '');
    const cmpFirst = aFirst.localeCompare(bFirst, undefined, { sensitivity: 'base', numeric: true });
    if (cmpFirst !== 0) return cmpFirst;
    return String(a.id ?? '').localeCompare(String(b.id ?? ''));
  });
}

