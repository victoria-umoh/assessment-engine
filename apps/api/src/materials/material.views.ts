// Candidate-facing material projection: title plus a single rendered body
// (authored/generated content, else text extracted from an upload). Internal
// fields — storageKey, generationMeta, linkedQuestionIds, extractedText as a
// named field — never serialize (allowlist construction).

export interface MaterialLike {
  _id: unknown;
  title: string;
  content?: string;
  extractedText?: string;
}

export function toCandidateMaterialView(m: MaterialLike) {
  return {
    _id: m._id,
    title: m.title,
    body: m.content ?? m.extractedText ?? '',
  };
}

// Admin list rows stay light: no content/extractedText/storageKey.
// Field set is pinned by materials-admin.e2e-spec.ts.
export interface AdminMaterialLike extends MaterialLike {
  source: string;
  status: string;
  archived: boolean;
  linkedQuestionIds?: unknown[];
}

export function toAdminMaterialListRow(m: AdminMaterialLike) {
  return {
    _id: m._id,
    title: m.title,
    source: m.source,
    status: m.status,
    archived: m.archived,
    linkedQuestionCount: m.linkedQuestionIds?.length ?? 0,
  };
}

// Full admin detail: everything an admin edits. storageKey stays server-side
// (file block re-projected without it). Pinned by materials-admin.e2e-spec.ts.
export interface AdminMaterialDetailLike extends AdminMaterialLike {
  failureReason?: string;
  file?: { originalName: string; mimeType: string; size: number };
  generationMeta?: { prompt: string; model: string; generatedAt: Date };
}

export function toAdminMaterialView(m: AdminMaterialDetailLike) {
  return {
    _id: m._id,
    title: m.title,
    source: m.source,
    status: m.status,
    failureReason: m.failureReason,
    archived: m.archived,
    file: m.file
      ? { originalName: m.file.originalName, mimeType: m.file.mimeType, size: m.file.size }
      : undefined,
    content: m.content,
    extractedText: m.extractedText,
    generationMeta: m.generationMeta,
    linkedQuestionIds: m.linkedQuestionIds ?? [],
  };
}
