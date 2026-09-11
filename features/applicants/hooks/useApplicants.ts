import { useQuery } from '@tanstack/react-query';
import { QUERY_KEYS } from '@/shared/constants';
import { StudentRepository } from '@/features/applicants/repositories/StudentRepository';

export function useStudents(search?: string) {
  return useQuery({
    queryKey: [...QUERY_KEYS.students, search ?? ''],
    queryFn: () =>
      search?.trim()
        ? StudentRepository.search(search)
        : StudentRepository.getAll(),
    refetchInterval: 2000,
  });
}

export function usePrograms() {
  return useQuery({
    queryKey: QUERY_KEYS.programs,
    queryFn: () => StudentRepository.getPrograms(),
  });
}
