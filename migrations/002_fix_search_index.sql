-- 修复搜索索引表达式与查询表达式不一致的问题。
--
-- 001 里建的索引是：(coalesce(title,'') || ' ' || coalesce(content,''))
-- 而 queryEntries 实际用的是：(coalesce(title,'') || ' ' || coalesce(content,'') || ' ' || coalesce(category,''))
-- 两者差了一个 category，导致 `q` 搜索根本用不上这个 GIN 索引，只能全表扫描。
--
-- 索引与查询必须字面完全一致，所以表达式在 src/lib/entries.ts 里以 SEARCH_EXPR 常量
-- 维护，改这里的时候要一起改。

drop index if exists entries_content_trgm;

create index if not exists entries_content_trgm
  on entries using gin (
    (coalesce(title, '') || ' ' || coalesce(content, '') || ' ' || coalesce(category, '')) gin_trgm_ops
  );
