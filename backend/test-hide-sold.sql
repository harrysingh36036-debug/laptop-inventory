SELECT l.status, count(*) AS count
FROM public.laptops l
WHERE (NULL IS NULL OR l.current_store_id = NULL)
  AND (
    (NULL IS NULL AND l.status <> 'Sold')
    OR (NULL IS NOT NULL AND l.status = NULL)
  )
GROUP BY l.status
ORDER BY l.status;
