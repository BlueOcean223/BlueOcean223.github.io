---
title: MySQL的Order By
pubDate: 2025-08-13T15:16:10.000Z
tags: []
---

在使用MySQL的过程中，常常会用到`Order By`来对查询结果进行排序。`Order By`可以按照一个或多个列进行排序，默认是升序排列（ASC），也可以指定为降序排列（DESC）。

但是需要注意的是，如果排序字段有多个重复的值，那么排序结果的顺序是不确定的，MySQL可以随意返回这些记录的顺序，可能导致每次查询的结果不一致。特别是在分页查询的情况下，如果重复值的行数超过了每页的行数，可能会导致结果重复或丢失。

例如下面的sql语句
```sql
SELECT *
FROM tasks
WHERE user_id = 2 AND type = 0
ORDER BY ddl DESC
LIMIT 5 OFFSET 0
```
该sql语句使用ddl作为排序字段，当ddl字段重复值少于5条时，由于少于分页限制数，MySQL会返回所有重复值的记录。这种情况下不容易发生bug。但是一旦ddl字段重复值超过5条，特别是排序在最前面的重复ddl记录数超过5条时，非常容易发生记录重复或丢失的情况。

因此在使用`Order By`时，建议添加一个辅助字段来确保排序结果的唯一性。通常可以使用主键或唯一索引字段来作为辅助排序。例如：
```sql
SELECT *
FROM tasks
WHERE user_id = 2 AND type = 0
ORDER BY ddl DESC, id
LIMIT 5 OFFSET 0
```
在这个sql语句中，当ddl值相同时，MySQL会根据id字段（主键）进行二次排序，从而保证了排序结果的唯一性和稳定性。这样可以避免在分页查询中出现重复或丢失记录的问题。对于辅助字段的升序降序，可根据实际的业务需求决定。
