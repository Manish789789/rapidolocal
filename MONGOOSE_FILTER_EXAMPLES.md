# Enhanced Mongoose Filter Examples

This document provides comprehensive examples of how to use the new `MongooseFilter` class that supports all MongoDB query operators including nested `$or` and `$and` operations.

## Basic Usage

```typescript
import { MongooseFilter, getRidesFromRedis } from './src/utils/mongo.feature';

// Filter an array of objects
const items = [
  { name: 'John', age: 25, city: 'New York' },
  { name: 'Jane', age: 30, city: 'Los Angeles' },
  { name: 'Bob', age: 35, city: 'New York' }
];

// Simple equality filter
const result1 = MongooseFilter.filter(items, { city: 'New York' });
// Returns: [{ name: 'John', age: 25, city: 'New York' }, { name: 'Bob', age: 35, city: 'New York' }]

// Check if single item matches
const matches = MongooseFilter.matches(items[0], { age: { $gte: 20 } });
// Returns: true
```

## Comparison Operators

```typescript
const users = [
  { name: 'Alice', age: 25, score: 85.5 },
  { name: 'Bob', age: 30, score: 92.0 },
  { name: 'Charlie', age: 22, score: 78.3 }
];

// Greater than
MongooseFilter.filter(users, { age: { $gt: 25 } });
// Returns: [{ name: 'Bob', age: 30, score: 92.0 }]

// Greater than or equal
MongooseFilter.filter(users, { age: { $gte: 25 } });
// Returns: [{ name: 'Alice', age: 25, score: 85.5 }, { name: 'Bob', age: 30, score: 92.0 }]

// Less than
MongooseFilter.filter(users, { age: { $lt: 25 } });
// Returns: [{ name: 'Charlie', age: 22, score: 78.3 }]

// Less than or equal
MongooseFilter.filter(users, { age: { $lte: 25 } });
// Returns: [{ name: 'Alice', age: 25, score: 85.5 }, { name: 'Charlie', age: 22, score: 78.3 }]

// Not equal
MongooseFilter.filter(users, { age: { $ne: 25 } });
// Returns: [{ name: 'Bob', age: 30, score: 92.0 }, { name: 'Charlie', age: 22, score: 78.3 }]

// Multiple conditions on same field
MongooseFilter.filter(users, { age: { $gte: 22, $lt: 30 } });
// Returns: [{ name: 'Alice', age: 25, score: 85.5 }, { name: 'Charlie', age: 22, score: 78.3 }]
```

## Array Operators

```typescript
const products = [
  { name: 'Laptop', categories: ['electronics', 'computers'], price: 999 },
  { name: 'Phone', categories: ['electronics', 'mobile'], price: 599 },
  { name: 'Book', categories: ['education', 'literature'], price: 29 }
];

// In operator
MongooseFilter.filter(products, { price: { $in: [599, 29] } });
// Returns: Phone and Book

// Not in operator
MongooseFilter.filter(products, { price: { $nin: [999] } });
// Returns: Phone and Book

// Array contains all elements
MongooseFilter.filter(products, { categories: { $all: ['electronics'] } });
// Returns: Laptop and Phone

// Array size
const orders = [
  { id: 1, items: ['item1', 'item2'] },
  { id: 2, items: ['item1'] },
  { id: 3, items: ['item1', 'item2', 'item3'] }
];

MongooseFilter.filter(orders, { items: { $size: 2 } });
// Returns: [{ id: 1, items: ['item1', 'item2'] }]
```

## Logical Operators

### Basic $or and $and

```typescript
const employees = [
  { name: 'Alice', department: 'Engineering', salary: 80000, experience: 5 },
  { name: 'Bob', department: 'Marketing', salary: 60000, experience: 3 },
  { name: 'Charlie', department: 'Engineering', salary: 95000, experience: 8 },
  { name: 'Diana', department: 'Sales', salary: 70000, experience: 4 }
];

// OR condition
MongooseFilter.filter(employees, {
  $or: [
    { department: 'Engineering' },
    { salary: { $gte: 70000 } }
  ]
});
// Returns: Alice, Charlie, Diana

// AND condition (implicit AND for multiple fields)
MongooseFilter.filter(employees, {
  department: 'Engineering',
  experience: { $gte: 6 }
});
// Returns: Charlie

// Explicit AND
MongooseFilter.filter(employees, {
  $and: [
    { department: 'Engineering' },
    { experience: { $gte: 6 } }
  ]
});
// Returns: Charlie
```

### Nested Logical Operators

```typescript
const rides = [
  { 
    id: 1, 
    status: 'completed', 
    driver: { rating: 4.5, experience: 2 }, 
    fare: 25.50,
    distance: 5.2 
  },
  { 
    id: 2, 
    status: 'active', 
    driver: { rating: 4.8, experience: 5 }, 
    fare: 18.75,
    distance: 3.1 
  },
  { 
    id: 3, 
    status: 'completed', 
    driver: { rating: 4.2, experience: 1 }, 
    fare: 32.00,
    distance: 7.8 
  }
];

// Complex nested conditions
MongooseFilter.filter(rides, {
  $or: [
    {
      $and: [
        { status: 'completed' },
        { 'driver.rating': { $gte: 4.5 } }
      ]
    },
    {
      $and: [
        { status: 'active' },
        { fare: { $lt: 20 } }
      ]
    }
  ]
});
// Returns: rides with id 1 and 2

// OR within AND
MongooseFilter.filter(rides, {
  $and: [
    {
      $or: [
        { status: 'completed' },
        { status: 'active' }
      ]
    },
    {
      $or: [
        { fare: { $gte: 30 } },
        { 'driver.rating': { $gte: 4.7 } }
      ]
    }
  ]
});
// Returns: rides with id 2 and 3

// Multiple levels of nesting
MongooseFilter.filter(rides, {
  $or: [
    {
      status: 'completed',
      $or: [
        { fare: { $gte: 30 } },
        {
          $and: [
            { 'driver.rating': { $gte: 4.5 } },
            { distance: { $lt: 6 } }
          ]
        }
      ]
    },
    {
      status: 'active',
      'driver.experience': { $gte: 4 }
    }
  ]
});
// Returns: rides with id 1 and 2
```

## Advanced Operators

### Regex and String Matching

```typescript
const users = [
  { name: 'John Doe', email: 'john@example.com' },
  { name: 'Jane Smith', email: 'jane@test.org' },
  { name: 'Bob Johnson', email: 'bob@example.com' }
];

// Regex matching
MongooseFilter.filter(users, {
  email: { $regex: /.*@example\.com$/ }
});
// Returns: John and Bob

// String regex
MongooseFilter.filter(users, {
  name: { $regex: 'John' }
});
// Returns: John Doe and Bob Johnson
```

### Existence and Type Checking

```typescript
const documents = [
  { title: 'Doc 1', content: 'Some content', tags: ['important'] },
  { title: 'Doc 2', content: 'Other content' },
  { title: 'Doc 3', tags: ['draft', 'review'] }
];

// Field exists
MongooseFilter.filter(documents, {
  tags: { $exists: true }
});
// Returns: Doc 1 and Doc 3

// Field doesn't exist
MongooseFilter.filter(documents, {
  tags: { $exists: false }
});
// Returns: Doc 2
```

### Element Match for Arrays

```typescript
const orders = [
  {
    id: 1,
    items: [
      { name: 'item1', price: 10, quantity: 2 },
      { name: 'item2', price: 15, quantity: 1 }
    ]
  },
  {
    id: 2,
    items: [
      { name: 'item3', price: 25, quantity: 1 },
      { name: 'item4', price: 5, quantity: 3 }
    ]
  }
];

// Element match - find orders with items that match all conditions
MongooseFilter.filter(orders, {
  items: {
    $elemMatch: {
      price: { $gte: 20 },
      quantity: { $gte: 1 }
    }
  }
});
// Returns: order with id 2
```

## Real-world Redis Examples

### Using with getRidesFromRedis

```typescript
// Simple status filter
const activeRides = await getRidesFromRedis({
  status: 'active'
});

// Complex ride filtering
const filteredRides = await getRidesFromRedis({
  $or: [
    {
      $and: [
        { status: 'completed' },
        { 'payment.amount': { $gte: 25 } },
        { 'driver.rating': { $gte: 4.5 } }
      ]
    },
    {
      $and: [
        { status: 'active' },
        { 'pickup.coordinates': { $exists: true } },
        { createdAt: { $gte: new Date('2024-01-01') } }
      ]
    }
  ]
});

// Date range with nested conditions
const recentHighValueRides = await getRidesFromRedis({
  $and: [
    {
      createdAt: {
        $gte: new Date('2024-01-01'),
        $lt: new Date('2024-12-31')
      }
    },
    {
      $or: [
        { 'payment.amount': { $gte: 50 } },
        {
          $and: [
            { 'driver.rating': { $gte: 4.8 } },
            { distance: { $gte: 10 } }
          ]
        }
      ]
    }
  ]
});
```

## Performance Tips

1. **Order filters by selectivity**: Place more selective filters first
2. **Use indexed fields**: When possible, filter on fields that would be indexed in MongoDB
3. **Avoid deep nesting**: While supported, excessive nesting can impact performance
4. **Use specific operators**: Use `$eq` explicitly when you need exact matches with type checking

## Error Handling

The filter function is designed to be safe:
- Unknown operators return `false` (fail-safe)
- Invalid regex patterns are caught and return `false`
- Null/undefined values are handled gracefully
- Type mismatches (e.g., using `$size` on non-arrays) return `false`

## Migration from Old Implementation

If you're upgrading from the previous implementation, simply replace:

```typescript
// Old way
drivers.filter((d: any) => matchesFilters(d, filters))

// New way
MongooseFilter.filter(drivers, filters)
```

The new implementation is backward compatible with simple filters and adds support for complex nested logical operations.
