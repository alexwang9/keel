<!-- keel:spec v1 -->

# Shelf

## Problem

Book clubs lose track of what they have read and what to read next.

## Goal

Give a book club one shared list of past and upcoming books with votes on the next pick.

## Target users

Members and organisers of small, informal book clubs.

## Project type

Web app: Responsive web app, mobile-first.

## Core features

### F1. Shared reading list

A club has one list of books, each marked read, reading or proposed.

Acceptance checks:

- A member can add a book by title and author.
- Each book shows whether it is read, being read or proposed.

### F2. Vote on the next book

Members vote on proposed books.
The organiser closes the vote.

Acceptance checks:

- A member can vote once per round.
- Closing the vote picks the winner.

## Out of scope

- Buying books
- Public clubs anyone can join

## Data model

### Entities

- **Club**: A group of members.
  Fields: name
- **Book**: A book on a club's list.
  Fields: title, author, status

### Relationships

- Club → Book (one-to-many): A club has many books.

## Integrations

- **Open Library API**: Look up book metadata and covers.

## Auth

None: Clubs share a private invite link; no accounts in V0.

## Deployment target

Vercel

## Constraints and preferences

- TypeScript
- No paid services
