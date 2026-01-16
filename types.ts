
export interface Category {
  id: string;
  name: string;
}

export interface Employee {
  id: string;
  name: string;
  categoryId: string;
  active: boolean;
  isRestricted: boolean;
}

export interface Environment {
  id: string;
  name: string;
  requirements: Record<string, number>; // categoryId -> quantity
}

export interface SpecialDay {
  date: string; // YYYY-MM-DD
  name: string;
  type: 'holiday' | 'sunday';
}

export interface ScheduleEntry {
  date: string; // YYYY-MM-DD
  employeeId: string;
  environmentId: string;
  categoryId: string;
}

export interface AppState {
  categories: Category[];
  employees: Employee[];
  environments: Environment[];
  specialDays: SpecialDay[];
  schedules: Record<string, ScheduleEntry[]>; // Month key (YYYY-MM) -> entries
}
