import type {
  B2CourseExerciseFile,
  B2CourseIndex,
  B2CourseUnitData,
  B2CourseVocabularyFile,
  B2CourseVocabularyItem,
} from "./types";

const BASE_PATH = "/data/courses/b2-course";

function joinPath(relativePath: string): string {
  return `${BASE_PATH}/${relativePath.replace(/^\/+/, "")}`;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`B2 Kurs data could not be loaded (${response.status}): ${url}`);
  }
  return (await response.json()) as T;
}

function assertIndex(index: B2CourseIndex): void {
  if (index?.schemaVersion !== "b2-course-index-v1" || !Array.isArray(index.units)) {
    throw new Error("B2 Kurs index.json has an invalid structure.");
  }
  if (index.course?.progressKey !== "dmt_b2_course_progress_v1") {
    throw new Error("B2 Kurs uses an unexpected progress key.");
  }
}

function assertUnit(
  unitNumber: number,
  vocabulary: B2CourseVocabularyFile,
  exercises: B2CourseExerciseFile,
): void {
  if (vocabulary?.schemaVersion !== "b2-course-content-v1" || !Array.isArray(vocabulary.items)) {
    throw new Error(`B2 Kurs unit ${unitNumber} has invalid vocabulary data.`);
  }
  if (exercises?.schemaVersion !== "b2-course-exercises-v1" || !Array.isArray(exercises.exercises)) {
    throw new Error(`B2 Kurs unit ${unitNumber} has invalid exercise data.`);
  }
  if (vocabulary.course?.unit !== unitNumber || exercises.unit !== unitNumber) {
    throw new Error(`B2 Kurs unit ${unitNumber} has inconsistent unit references.`);
  }
}

export class B2CourseService {
  private static indexPromise: Promise<B2CourseIndex> | null = null;
  private static unitPromises = new Map<number, Promise<B2CourseUnitData>>();

  static clearCache(): void {
    this.indexPromise = null;
    this.unitPromises.clear();
  }

  static getIndex(): Promise<B2CourseIndex> {
    if (!this.indexPromise) {
      this.indexPromise = fetchJson<B2CourseIndex>(joinPath("index.json")).then((index) => {
        assertIndex(index);
        return {
          ...index,
          units: [...index.units]
            .filter((unit) => unit.enabled !== false)
            .sort((left, right) => left.unit - right.unit),
        };
      });
    }
    return this.indexPromise;
  }

  static async getUnit(unitNumber: number): Promise<B2CourseUnitData> {
    const cached = this.unitPromises.get(unitNumber);
    if (cached) return cached;

    const request = (async () => {
      const index = await this.getIndex();
      const summary = index.units.find((unit) => unit.unit === unitNumber);
      if (!summary) throw new Error(`B2 Kurs unit ${unitNumber} was not found.`);

      const [vocabulary, exercises] = await Promise.all([
        fetchJson<B2CourseVocabularyFile>(joinPath(summary.vocabularyFile)),
        fetchJson<B2CourseExerciseFile>(joinPath(summary.exercisesFile)),
      ]);
      assertUnit(unitNumber, vocabulary, exercises);
      return { summary, vocabulary, exercises };
    })();

    this.unitPromises.set(unitNumber, request);
    request.catch(() => this.unitPromises.delete(unitNumber));
    return request;
  }

  static async getVocabularyRegistry(): Promise<Map<string, B2CourseVocabularyItem>> {
    const index = await this.getIndex();
    const units = await Promise.all(index.units.map((unit) => this.getUnit(unit.unit)));
    const registry = new Map<string, B2CourseVocabularyItem>();
    units.forEach((unit) => {
      unit.vocabulary.items.forEach((item) => {
        if (registry.has(item.courseItemId)) {
          throw new Error(`Duplicate B2 course item ID: ${item.courseItemId}`);
        }
        registry.set(item.courseItemId, item);
      });
    });
    return registry;
  }

  static async getResolvedVocabulary(unitNumber: number): Promise<B2CourseVocabularyItem[]> {
    const [unit, registry] = await Promise.all([
      this.getUnit(unitNumber),
      this.getVocabularyRegistry(),
    ]);
    const reused = (unit.vocabulary.reusedVocabularyRefs ?? [])
      .map((reference) => registry.get(reference.courseItemId))
      .filter((item): item is B2CourseVocabularyItem => Boolean(item));
    const seen = new Set<string>();
    return [...unit.vocabulary.items, ...reused].filter((item) => {
      if (seen.has(item.courseItemId)) return false;
      seen.add(item.courseItemId);
      return true;
    });
  }
}
