# To do

Ideas waiting to be built. Not urgent; each one still needs its best approach
worked out before writing code.

## Labeled cross-links between nodes

**What:** connect two nodes that already exist in the map, even in different
branches, and write the relationship on the line ("Tests *verify* Requirements",
"Customer *places* Order"), without moving either node. Most useful in the
concept map and the mind map. A related extra: labels on the normal parent →
child lines ("is made of", "splits into").

**Two proposals so far** (both from a chat with an AI; to be compared):

1. **Written in the Markdown.** Each node gets a hidden id and the links are
   declared in comments, so the text alone describes the whole map:

   ```markdown
   ### Requirements <!-- id: req -->
   ### Tests <!-- id: tests -->
   <!-- link: {"from":"tests","to":"req","text":"verify"} -->
   ```

2. **A visual editor.** An "Add link" button: pick the source, pick the target,
   type the label; then edit, delete or undo it. The links live in a separate
   list (`{id, from, to, text}`), apart from the tree. Style (color, dashes) and
   hand-tuned routes could come later.

They are not exclusive: the editor could just write the syntax of option 1 into
the text, which would keep the tool as "Markdown in, map out" and let the AI
prompt produce links too.

**Already checked:**

* markmap keeps an inline comment inside the node's text
  (`"Requirements <!-- id: req -->"`), and it doesn't show when drawn. A
  comment on its own line is dropped from the tree, so the link declarations
  would have to be read from the raw Markdown.
* The vector PDF (`motor.js`) doesn't handle dashed strokes yet.

**Open questions:**

* Which syntax: JSON in comments is heavy to type by hand; something shorter
  like `<!-- tests -> req: verify -->` might be friendlier.
* How to route the lines so they don't cross boxes, and where to put the labels
  so they don't overlap, while keeping the drawing deterministic.
* Which map types get it (the brace map is markmap's own layout).
* What to show when an id is repeated or a link points to a missing node.
