# ReMark Mark List UI / Interaction Requirements

## 1. Core Information Architecture

ReMark currently supports two types of Mark:

- **Highlight Mark** — a piece of text highlighted on a webpage.
- **Video Mark** — a timestamp marker created while watching a video.

A Mark may optionally contain a **Note**.

The information hierarchy must be:

```text
Mark
├── Mark content
├── Source metadata
└── Optional Note
```

Do **not** treat Note as a separate list item.

Do **not** create separate lists for Highlight and Video Mark.

------

## 2. Main Mark List: Pure Time Feed

The main Mark list must be a **pure chronological feed**.

Sort all Marks by:

```text
createdAt DESC
```

Newest Marks appear first, regardless of their Source.

Do NOT group Marks by webpage/source in the main list.

Example:

```text
Today

Mark A
Source A

Mark B
Source B

Mark C
Source A

Mark D
Source C
```

Even if several Marks belong to the same webpage, they must remain in chronological order.

### Reason

The main user intent is:

> "What did I save / mark recently?"

The main ReMark experience should therefore feel like a **memory / reading trace**, not a bookmark manager or knowledge-base browser.

------

## 3. Mark Is the Primary Object

The Mark itself must be visually dominant.

The Source is contextual metadata and should be visually weaker.

Recommended hierarchy:

```text
Mark content
    ↓
Optional Note
    ↓
Source metadata
    ↓
Time / secondary metadata
```

Avoid making the webpage title or URL visually stronger than the actual Mark.

The user should immediately perceive:

> "This is something I marked."

rather than:

> "This is a webpage containing some marks."

------

## 4. Highlight Mark

A Highlight Mark should primarily display the highlighted text.

Do NOT add a heavy "Highlight" label unless necessary.

Example:

```text
“The biggest change will not be the technology...”

The Future of AI · The Verge
12 min ago
```

The highlighted text itself should communicate that this is a Highlight.

------

## 5. Video Mark

A Video Mark should use the timestamp as its primary visual identifier.

Example:

```text
▶ 12:34

“The real shift is happening here...”

How I Build Products · YouTube
15 min ago
```

Do NOT make "Video Mark" a large label.

The timestamp is the natural identifier.

------

## 6. Note Behavior

A Note is always part of its parent Mark.

Never render a Note as an independent Mark/list item.

Example:

```text
“The real shift is happening here...”

↳ This reminds me of my current product idea.

How I Build Products · YouTube
15 min ago
```

Visual hierarchy:

```text
Mark
  └── Note
```

The Note should be visually secondary to the Mark.

If there is no Note, do not reserve unnecessary space for it.

------

## 7. Mark Click Behavior

Clicking the **Mark content itself** should directly return the user to the original source and locate the corresponding position.

### Highlight

Click Mark:

```text
→ Open original webpage
→ Scroll / locate the highlighted text
→ Make the Mark visually identifiable
```

### Video Mark

Click Mark:

```text
→ Open original video
→ Jump directly to the recorded timestamp
```

The Mark itself therefore acts as a "jump back" action.

There should be no intermediate Source page.

------

## 8. Source Click Behavior

The Source has a different purpose from the Mark.

Clicking the Source should NOT directly open the webpage.

Instead:

```text
Click Source
    ↓
Open Source Mark Collection
```

This allows the user to answer:

> "What did I mark in this particular piece of content?"

Example:

```text
The Future of AI
The Verge

5 Marks

“The biggest change will not...”

“AI won't replace people...”

▶ 18:42 ...

“The real shift is happening...”
```

The Source therefore acts as an entry point into the user's **Mark collection for that Source**.

------

## 9. Source Mark Collection Ordering

The ordering rules are different from the main Mark Feed.

### Main Mark Feed

Sort by:

```text
createdAt DESC
```

Purpose:

> "What did I mark recently?"

### Source Mark Collection

Sort according to the **native order of the original content**.

For articles/webpages:

```text
Document position ASC
Top → Bottom
```

For videos:

```text
Timestamp ASC
Beginning → End
```

For PDFs or other paginated content:

```text
Page number ASC
Position within page ASC
```

Do NOT sort the Source collection by Mark creation time by default.

### Principle

> **The main feed follows the user's marking timeline.
> The Source collection follows the source's native reading/viewing order.**

------

## 10. No Separate "Source Page" Is Required in the Main IA

Do not redesign the main navigation into:

```text
Sources
  ↓
Source Detail
  ↓
Marks
```

This would make ReMark feel like a bookmark/content-management tool.

Instead:

```text
Main Mark Feed
    ↓
Click Mark → Jump to source position

Click Source
    ↓
Source Mark Collection
```

Source is an auxiliary navigation dimension, not the primary information hierarchy.

------

## 11. Visual Design Principles

The overall UI should feel like a **reading / memory layer**, not a database.

### Prefer

- Lightweight visual hierarchy
- Mark content as the visual focus
- Subtle Source metadata
- Minimal borders
- Minimal card treatment
- Generous whitespace
- Clear distinction between Mark and Note
- Small, unobtrusive timestamp/source metadata
- Consistent visual grammar between Highlight and Video Mark

### Avoid

- Heavy database-style cards
- Separate visual systems for Highlight / Video Mark
- Large Source headers dominating every item
- Notes appearing as independent cards
- Excessive tags/badges
- Making URL/title more prominent than the Mark
- Grouping the main feed by Source

------

## 12. Core Interaction Model

The final interaction model should be:

```text
                         ┌── Click Mark
                         │      ↓
                         │  Jump to original
                         │  content / timestamp
                         │
Mark ────────────────────┤
                         │
                         └── Click Source
                                ↓
                          Source Mark Collection
                                ↓
                          Native content order

Mark
 └── Optional Note
```

### Core mental model

ReMark should answer two different questions:

**Main feed:**

> "What did I leave behind?"

**Source collection:**

> "What did I leave behind in this content?"

**Original source:**

> "What is the full context?"

Therefore:

> **ReMark remembers. The original content explains.**

Do not duplicate the full source content inside ReMark unnecessarily.

------

## 13. Implementation Priority

### P0 — Must Have

1. Convert the main list to a pure chronological Mark feed.
2. Remove Source-based grouping from the main list.
3. Treat Highlight and Video Mark as the same fundamental Mark object.
4. Keep Note inside its parent Mark.
5. Make Mark click jump to the exact original location.
6. Make Source click open the Source's Mark collection.
7. Sort Source collections by native source order.

### P1 — Visual Refinement

1. Reduce Source visual weight.
2. Make Mark content visually dominant.
3. Use timestamp as the primary Video Mark identifier.
4. Remove unnecessary "Highlight" / "Video Mark" labels.
5. Reduce card/border heaviness.
6. Make Note visually secondary.

### P2 — Future Extensibility

The model should support additional Mark types later without changing the information architecture:

```text
Article Mark
Video Mark
PDF Mark
Image Mark
Audio Mark
...
```

All should follow:

```text
Mark
├── Content / Position
├── Optional Note
└── Source
```