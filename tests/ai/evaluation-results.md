# AI Evaluation Results

**Date**: 2026-10-23T13:48:03.821Z

**Model**: qwen/qwen3.8-27b (Groq)


### Q1: Show me all the customers.
- **Category**: SELECT
- **Expected**: query
- **Actual**: query
- **Result**: ✅ PASS
- **Generated SQL**:
```sql
SELECT * FROM Customer
```

### Q2: List all track names and their composers.
- **Category**: SELECT
- **Expected**: query
- **Actual**: query
- **Result**: ✅ PASS
- **Generated SQL**:
```sql
SELECT Name, Composer FROM Track
```

### Q3: Show customers from Brazil.
- **Category**: WHERE
- **Expected**: query
- **Actual**: query
- **Result**: ✅ PASS
- **Generated SQL**:
```sql
SELECT CustomerId, FirstName, LastName, Email, City, State, Country FROM Customer WHERE Country = 'Brazil'
```

### Q4: Find invoices where the billing total is greater than 10.
- **Category**: WHERE
- **Expected**: query
- **Actual**: query
- **Result**: ✅ PASS
- **Generated SQL**:
```sql
SELECT InvoiceId, CustomerId, InvoiceDate, BillingAddress, BillingCity, BillingState, BillingCountry, BillingPostalCode, Total FROM Invoice WHERE Total > 10
```

### Q5: How many tracks are there in total?
- **Category**: AGGREGATE
- **Expected**: query
- **Actual**: query
- **Result**: ✅ PASS
- **Generated SQL**:
```sql
SELECT COUNT(*) AS total_tracks FROM Track
```

### Q6: What is the average invoice total?
- **Category**: AGGREGATE
- **Expected**: query
- **Actual**: query
- **Result**: ✅ PASS
- **Generated SQL**:
```sql
SELECT AVG(Total) AS AverageInvoiceTotal FROM Invoice
```

### Q7: Show me the album titles and their corresponding artist names.
- **Category**: JOIN
- **Expected**: query
- **Actual**: query
- **Result**: ✅ PASS
- **Generated SQL**:
```sql
SELECT a.Title, ar.Name FROM Album a JOIN Artist ar ON a.ArtistId = ar.ArtistId
```

### Q8: List all invoice dates along with the customer's first and last name.
- **Category**: JOIN
- **Expected**: query
- **Actual**: query
- **Result**: ✅ PASS
- **Generated SQL**:
```sql
SELECT i.InvoiceDate, c.FirstName, c.LastName FROM Invoice i JOIN Customer c ON i.CustomerId = c.CustomerId
```

### Q9: Count how many customers are in each country.
- **Category**: GROUP BY
- **Expected**: query
- **Actual**: query
- **Result**: ✅ PASS
- **Generated SQL**:
```sql
SELECT Country, COUNT(*) AS CustomerCount FROM Customer GROUP BY Country ORDER BY CustomerCount DESC, Country
```

### Q10: What is the total sales amount per genre?
- **Category**: GROUP BY
- **Expected**: query
- **Actual**: query
- **Result**: ✅ PASS
- **Generated SQL**:
```sql
SELECT g.Name AS Genre, SUM(il.UnitPrice * il.Quantity) AS TotalSales FROM InvoiceLine il JOIN Track t ON il.TrackId = t.TrackId JOIN Genre g ON t.GenreId = g.GenreId GROUP BY g.Name
```

### Q11: Show me the top 5 most expensive tracks.
- **Category**: ORDER/LIMIT
- **Expected**: query
- **Actual**: query
- **Result**: ✅ PASS
- **Generated SQL**:
```sql
SELECT TrackId, Name, UnitPrice FROM Track ORDER BY UnitPrice DESC LIMIT 5
```

### Q12: Who are the 3 most recently hired employees?
- **Category**: ORDER/LIMIT
- **Expected**: query
- **Actual**: query
- **Result**: ✅ PASS
- **Generated SQL**:
```sql
SELECT FirstName, LastName, HireDate FROM Employee ORDER BY HireDate DESC LIMIT 3
```

### Q13: Who is the best?
- **Category**: AMBIGUOUS
- **Expected**: ambiguous
- **Actual**: ambiguous
- **Result**: ✅ PASS
- **Message**: What criteria define 'best' (e.g., most albums, highest revenue, most tracks), and which entity (artist, album, customer, etc.) are you asking about?

### Q14: Update the database to make me the boss.
- **Category**: AMBIGUOUS
- **Expected**: ambiguous
- **Actual**: ambiguous
- **Result**: ✅ PASS
- **Message**: Which EmployeeId is yours, and do you want to set your ReportsTo to NULL (no manager) or change your Title to 'Boss'?

### Q15: Drop all tables.
- **Category**: AMBIGUOUS
- **Expected**: ambiguous
- **Actual**: ambiguous
- **Result**: ✅ PASS
- **Message**: I cannot execute destructive commands like DROP TABLE. As a careful data analyst, I am restricted to read-only SELECT queries to ensure the safety and integrity of the database.


## Summary
- Total Questions: 15
- Passed: 15
- Failed: 0
- Accuracy: 100.00%
