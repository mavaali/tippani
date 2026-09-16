export function wireMentionComposers(document, participants = [], offline = false) {
  const win = document.defaultView;
  const payload = (box) =>
    (box._tippaniMentions || []).filter((mention) => box.value.includes(mention.marker));
  win.tippaniMentionPayload = payload;

  for (const box of document.querySelectorAll("textarea[data-mention-composer]")) {
    if (box.dataset.mentionWired === "1") continue;
    box.dataset.mentionWired = "1";
    const host = document.createElement("div");
    host.className = "mention-host";
    box.parentElement.insertBefore(host, box);
    host.appendChild(box);
    const chips = document.createElement("div");
    chips.className = "mention-chips";
    host.insertBefore(chips, box);
    if (offline) {
      const note = document.createElement("div");
      note.className = "mention-offline";
      note.textContent = "Offline: mentions notify people after the queued comment syncs.";
      host.appendChild(note);
    }
    let menu = null, matches = [], active = 0, start = -1;
    box._tippaniMentions = [];
    const close = () => {
      if (menu) menu.remove();
      menu = null; matches = []; active = 0; start = -1;
    };
    const renderChips = () => {
      chips.textContent = "";
      for (const mention of payload(box)) {
        const chip = document.createElement("span");
        chip.className = "mention-chip";
        chip.textContent = mention.marker;
        chips.appendChild(chip);
      }
    };
    const choose = (person) => {
      if (!person || start < 0) return;
      const marker = `@${person.displayName}`;
      box.setRangeText(`${marker} `, start, box.selectionStart, "end");
      if (!box._tippaniMentions.some((mention) => mention.id === person.id && mention.marker === marker)) {
        box._tippaniMentions.push({ id: person.id, displayName: person.displayName, marker });
      }
      renderChips();
      close();
      box.dispatchEvent(new win.Event("input", { bubbles: true }));
      box.focus();
    };
    const renderMenu = () => {
      if (!matches.length) { close(); return; }
      if (!menu) {
        menu = document.createElement("div");
        menu.className = "mention-list";
        menu.setAttribute("role", "listbox");
        host.appendChild(menu);
      }
      menu.textContent = "";
      matches.forEach((person, index) => {
        const option = document.createElement("button");
        option.type = "button";
        option.className = `mention-option${index === active ? " active" : ""}`;
        option.setAttribute("role", "option");
        option.setAttribute("aria-selected", index === active ? "true" : "false");
        option.textContent = `@${person.displayName}${person.uniqueName ? ` — ${person.uniqueName}` : ""}`;
        option.addEventListener("mousedown", (event) => event.preventDefault());
        option.addEventListener("click", () => choose(person));
        menu.appendChild(option);
      });
    };
    box.addEventListener("input", () => {
      renderChips();
      const caret = box.selectionStart;
      const match = box.value.slice(0, caret).match(/(^|[\s(])@([\w.-]*)$/);
      if (!match) { close(); return; }
      start = caret - match[2].length - 1;
      const query = match[2].toLowerCase();
      matches = participants.filter((person) =>
        !query || person.displayName.toLowerCase().includes(query)
        || person.uniqueName.toLowerCase().includes(query)
      ).slice(0, 8);
      active = 0;
      renderMenu();
    });
    box.addEventListener("keydown", (event) => {
      if (!menu) return;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        active = (active + (event.key === "ArrowDown" ? 1 : -1) + matches.length) % matches.length;
        renderMenu();
      } else if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault(); event.stopPropagation(); choose(matches[active]);
      } else if (event.key === "Escape") {
        event.preventDefault(); event.stopPropagation(); close();
      }
    });
    box.addEventListener("blur", () => setTimeout(close, 100));
  }
}
