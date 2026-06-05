---
title: Checkout Redesign
reviewers: [alice, bob]
---

# Checkout Redesign

<!-- DRAFT — do not distribute -->

[[_TOC_]]

## Goals

1. Reduce cart abandonment
2. Support **Apple Pay** and *Google Pay*
3. Single-page flow

## Comparison

| Option      | Cost | Effort | Ship   |
| ----------- | ---: | :----: | ------ |
| Incremental |  $10 |  low   | Q1     |
| Rewrite     | $100 |  high  | Q3     |

## Notes

> Decision pending @alice review.

```ts
type Cart = { items: Item[]; total: number };
```

See #8842.
