export interface ShowInput {
  name?: string;
  presenter?: string;
  description?: string | null;
  artUrl?: string | null;
}

export function validateShowInput(
  body: ShowInput,
  requireAll: boolean
): { values: Record<string, unknown> } | { error: string } {
  const values: Record<string, unknown> = {};

  if (body.name !== undefined || requireAll) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return { error: "Show name is required." };
    values.name = name.slice(0, 120);
  }
  if (body.presenter !== undefined || requireAll) {
    const presenter = typeof body.presenter === "string" ? body.presenter.trim() : "";
    if (!presenter) return { error: "Presenter / DJ is required." };
    values.presenter = presenter.slice(0, 120);
  }
  if (body.description !== undefined) {
    values.description =
      typeof body.description === "string" && body.description.trim()
        ? body.description.trim().slice(0, 1000)
        : null;
  }
  if (body.artUrl !== undefined) {
    if (body.artUrl === null || body.artUrl === "") {
      values.artUrl = null;
    } else if (typeof body.artUrl === "string" && body.artUrl.startsWith("/api/media/radio/")) {
      values.artUrl = body.artUrl;
    } else {
      return { error: "Album art must be uploaded through the radio uploader." };
    }
  }
  return { values };
}
