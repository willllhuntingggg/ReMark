# ReMark — Mark & Note Interaction Requirements

## 1. Product Principle

ReMark is a lightweight capture tool for people who encounter something worth remembering while reading webpages or watching videos.

The core mental model is:

**Capture → Think → Organize**

- **Mark** = capture a meaningful moment/content.
- **Note** = capture the user's thought about that Mark.
- Mark should be extremely fast and low-friction.
- Note is optional and should never interrupt normal Mark behavior.
- Do not make ReMark feel like a traditional note-taking or annotation editor.

The key principle:

> **Mark captures the moment. Note captures the thought.**

------

## 2. Mark Is the Primary Object

A Mark can come from two sources:

### Web

User selects text and uses:

```
⌘ + Drag
```

→ Create a text Mark.

### Video

User presses:

```
⌘ + M
```

→ Create a timestamp Mark at the current video position.

The two types should share the same conceptual data model:

```text
Mark
├── Source
├── Location
│   ├── Web: selected text / page position
│   └── Video: timestamp
└── Note (optional)
```

Do not make Web Mark and Video Mark feel like two unrelated features.

------

## 3. Clicking Behavior

This is an important existing product decision:

> **Clicking a Mark always navigates back to the original content/location.**

### Web Mark

Click Mark → return to the original webpage and corresponding text position.

### Video Mark

Click Mark → open/play the video at the corresponding timestamp.

Do NOT make clicking the Mark itself enter Note editing mode.

This navigation behavior must remain predictable and stable.

------

# 4. Adding Note After Mark

A user may decide to add a Note after creating a Mark.

### Mouse interaction

On hover over a Mark, expose a subtle secondary action:

```text
+ Note
```

If the Mark already has a Note, the Note area itself can be clicked to edit it.

The entire Mark remains the navigation target.

Conceptually:

```text
┌─────────────────────────────┐
│ “Important highlighted text”│  ← click → navigate
│                             │
│ 💭 Add a note                │  ← click → edit/add note
└─────────────────────────────┘
```

Do not permanently show large “Add Note” controls on every Mark. The UI should remain visually quiet.

------

# 5. Mark + Note in One Action

This is a core requirement.

Users sometimes have an immediate thought at the exact moment they create a Mark. They should not have to:

1. Create Mark
2. Find the Mark again
3. Open the Mark
4. Click Add Note
5. Start typing

That breaks the user's thinking flow.

ReMark should therefore support a dedicated **Mark + Note** action.

## Web

Normal:

```
⌘ + Drag
```

→ Mark only.

Mark + Note:

```
⌘ + Shift + Drag
```

→ Create Mark + immediately enter Note input.

## Video

Normal:

```
⌘ + M
```

→ Video Mark only.

Mark + Note:

```
⌘ + Shift + M
```

→ Create Video Mark + immediately enter Note input.

------

# 6. Meaning of Shift

The shortcut system should have a consistent semantic rule:

```text
⌘
= Capture

⌘ + Shift
= Capture + Think
```

Therefore:

```text
⌘ + Drag
→ Mark

⌘ + Shift + Drag
→ Mark + Note

⌘ + M
→ Video Mark

⌘ + Shift + M
→ Video Mark + Note
```

This should feel like one coherent interaction language rather than unrelated shortcuts.

------

# 7. Note Input Behavior

When using a Mark + Note action:

### Web

After creating the Mark, show a lightweight Note input close to the selected content rather than forcing the user to move attention to the sidebar.

Conceptually:

```text
Selected content
────────────────────────

┌──────────────────────────┐
│ Add a note...             │
└──────────────────────────┘
```

After submission:

- Save the Note.
- Dismiss the temporary input.
- Keep the user on the current page.
- The sidebar/list should now show the Mark with its Note.

### Video

When using:

```
⌘ + Shift + M
```

recommended behavior:

1. Capture current timestamp.
2. Pause the video.
3. Open lightweight Note input.
4. User enters Note.
5. Save Note.
6. Resume playback.

The goal is to avoid losing the exact thought associated with the timestamp.

Normal `⌘ + M` must NOT pause the video.

------

# 8. Adding Note Later

A Mark does not require a Note.

There are three valid workflows:

### A. Mark only

```text
⌘ + Drag
→ Mark
```

or

```text
⌘ + M
→ Video Mark
```

### B. Mark + immediate Note

```text
⌘ + Shift + Drag
→ Mark + Note
```

or

```text
⌘ + Shift + M
→ Video Mark + Note
```

### C. Add Note later

```text
Hover Mark
→ + Note
```

or via keyboard:

```text
Select/focus Mark
→ ⌘ + Enter
→ Add/Edit Note
```

All three workflows should coexist.

------

# 9. Note Editing

Notes should behave like lightweight thoughts, not formal documents.

Avoid:

- Save / Cancel buttons
- Complex editor UI
- Mandatory titles
- Large editing panels
- Extra confirmation steps

Prefer:

- Inline or lightweight input
- Auto-save
- Enter to submit
- Click outside → save
- Real-time or near-real-time persistence

The user should feel:

> “I just attached a thought to this Mark.”

not:

> “I am editing a note record.”

------

# 10. Deleting Marks

Deletion should be a secondary management action, not part of the main navigation flow.

Recommended interaction:

```text
Hover Mark
→ ···
→ Delete
```

Keyboard support:

```text
Focused Mark
→ Delete / Backspace
```

After deletion:

- Immediately remove the Mark.
- If the Mark contains a Note, delete the Note together with the Mark.
- Support `⌘ + Z` to undo.

Avoid unnecessary confirmation dialogs for normal deletion.

The interaction should feel lightweight and reversible.

------

# 11. Deleting Notes

Deleting a Note should NOT delete its associated Mark.

The relationship is:

```text
Mark
└── Note (optional)
```

Therefore:

```text
Delete Note
→ Mark remains
→ Note disappears
```

But:

```text
Delete Mark
→ Mark disappears
→ Associated Note disappears
```

This distinction must be preserved.

------

# 12. UI Principles

The interface should communicate that Marks are **saved traces of attention**, not database records.

Avoid making each Mark look like a form containing:

```text
Highlight
Note
Project
Tag
Source
Delete
...
```

Instead, prioritize the actual content:

```text
“Important piece of content...”

💭 My thought about it...
```

Secondary actions should remain visually quiet and appear contextually.

The UI should feel:

- Lightweight
- Calm
- Content-first
- Fast
- Minimal
- Thought-oriented
- Non-intrusive

Avoid excessive buttons, popovers, confirmation dialogs, and persistent controls.

------

# 13. Interaction Hierarchy

The interaction hierarchy should be:

### Primary

**Mark**

Fastest and most frictionless action.

### Secondary

**Note**

Optional deeper thought attached to a Mark.

### Tertiary

**Organization / Management**

Such as:

- Project
- Tag
- Delete
- Other metadata

Do not let organization features interfere with the capture experience.

------

# 14. Critical UX Rules

The implementation must follow these rules:

1. **Clicking a Mark always means navigation.**
2. **Mark must remain usable without creating a Note.**
3. **Note must never be mandatory.**
4. **Mark + Note must be possible in one continuous interaction.**
5. **Web Mark and Video Mark should share the same mental model.**
6. **Normal Video Mark must not interrupt playback.**
7. **Video Mark + Note may temporarily pause playback to preserve thinking flow.**
8. **Notes should be lightweight and automatically saved.**
9. **Deleting a Mark deletes its Note; deleting a Note does not delete its Mark.**
10. **Do not turn ReMark into a traditional annotation/note editor.**

------

# 15. Target User Experience

The final experience should make these three moments feel effortless:

### “I want to remember this.”

→ Mark

### “I have a thought about this.”

→ Mark + Note

### “I want to come back to this later.”

→ Click Mark → return to the exact source location.

The product should minimize the distance between:

**seeing something → capturing it → expressing the thought → returning to the source.**

The user should never feel that they are “managing notes” while they are reading or watching.