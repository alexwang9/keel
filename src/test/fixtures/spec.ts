import type { SpecDraft } from "@/lib/spec/schema";

/** A draft that passes `isSpecComplete`. Shared by spec, interview and creation tests. */
export const completeDraft = {
  name: "Shelf",
  problem: "Book clubs lose track of what they have read and what to read next.",
  goal: "Give a book club one shared list of past and upcoming books with votes on the next pick.",
  targetUsers: "Members and organisers of small, informal book clubs.",
  projectType: { kind: "web-app", detail: "Responsive web app, mobile-first." },
  features: [
    {
      id: "F1",
      title: "Shared reading list",
      description: "A club has one list of books, each marked read, reading or proposed.",
      acceptanceChecks: [
        "A member can add a book by title and author.",
        "Each book shows whether it is read, being read or proposed.",
      ],
    },
    {
      id: "F2",
      title: "Vote on the next book",
      description: "Members vote on proposed books.\nThe organiser closes the vote.",
      acceptanceChecks: ["A member can vote once per round.", "Closing the vote picks the winner."],
    },
  ],
  outOfScope: ["Buying books", "Public clubs anyone can join"],
  dataModel: {
    none: false,
    entities: [
      { id: "E1", name: "Club", description: "A group of members.", fields: ["name"] },
      {
        id: "E2",
        name: "Book",
        description: "A book on a club's list.",
        fields: ["title", "author", "status"],
      },
    ],
    relationships: [
      {
        id: "R1",
        from: "E1",
        to: "E2",
        kind: "one-to-many",
        description: "A club has many books.",
      },
    ],
  },
  integrations: {
    none: false,
    items: [{ id: "I1", name: "Open Library API", purpose: "Look up book metadata and covers." }],
  },
  auth: { none: true, reason: "Clubs share a private invite link; no accounts in V0." },
  deploymentTarget: "Vercel",
  constraints: ["TypeScript", "No paid services"],
  openQuestions: [],
} satisfies SpecDraft;
