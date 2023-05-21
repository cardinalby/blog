---
title: "Storing currency values: data types, caveats, best practices"
date: 2023-01-08
draft: false
categories:
- Best practices
tags:
- data-types
- computer-science
- db
image: "images/posts/best-practices/storing-currency-values-data-types/title.png"
---
## Intro

Repeatedly facing questions, debates, and mistakes related to storing and representing currency amounts, I decided to collect all facts and advice regarding this topic in one place. This article is not the final source of the truth, but it contains useful information that you should take into consideration when designing software.

## Domain info: currencies

### Just facts:
There is [`ISO 4217`](https://en.wikipedia.org/wiki/ISO_4217) standard that describes currency codes and their minor units. Data are also available in XML and CSV representations (following the links from the [page](https://www.six-group.com/en/products-services/financial-information/data-standards.html)).

1. A currency has a 3-letter code, a numeric code, and a name. A currency may have multiple listed locations.
2. Some currencies have exchange rates that are pegged (fixed) to another currency.
3. **Minor unit** is the smallest unit of a currency, e.g. 1 dollar equals 100 cents (with 2 decimals).
4. Most currencies have 2 decimals; some have none, and some have 3 decimals.
5. [Mauritania](https://en.wikipedia.org/wiki/Mauritanian_ouguiya) and 
[Madagascar](https://en.wikipedia.org/wiki/Malagasy_ariary) do **not** use a **decimal** division of units, 
setting 1 _ouguiya_ = 5 _khoums_, _ariary_ = 5 _iraimbilanja_.
6. Cryptocurrencies can have up to 18 decimals ([_ETH_](https://beaconcha.in/tools/unitConverter)).
7. The number of decimals [can](https://en.wikipedia.org/wiki/Ugandan_shilling) **change** over time due to inflation.
8. The same can happen because of [redenomination](https://en.wikipedia.org/wiki/Redenomination), but a new currency code should be introduced.
9. For some currencies, there are no [physical denominations](https://en.wikipedia.org/wiki/Cash_rounding) for the minor unit.
10. Storing prices of small units of goods (probably as a result of conversion from another currency) can require using **more decimals** than are defined for a currency.

### Storage requirements
1. Obvious one: store currency amounts **along with** a link to the currency **specification**
   (foreign key in databases, a special class in programming languages) to interpret and operate with it correctly.
2. Storing a **specification** for a currency you should include:
   - **_Minimum accountable unit_** instead of or in addition to **precision** (see _fact 5_).
   - **_Lowest physical denomination_** of the currency if you deal with cash operations (see _fact 9_).
3. Ensure **precision** for currency amounts equals the max precision of all supported currencies.
4. Consider adding **additional precision** for operational needs: accumulators and intermediate calculations or for storing
   prices of small units of goods. For example, you may want to accumulate a _10 %_ fee from 1 cent operations,
   sum them up until they reach the _minimum accountable unit_ (cent) and withdraw from a client.

## Data types
There are different data types that can technically store money values. Let’s see how the listed requirements can be fulfilled by utilizing different data types.

## 1️⃣ Integer number of minor units
One of the popular ([Stripe](https://stripe.com/docs/currencies#zero-decimal) approaches) is storing an integer number of minor units. Simply put, you store **_5 $_** as **_500 cents_**. This way you can do accurate calculations and comparisons internally and then display the result formatting the number in a proper way as an amount of dollars.

Taking into consideration the requirement about **additional precision** (let's say 3 extra decimals) you will represent **_5 $_** as **_500 000_** of **"micro units"**, where **_1_** _micro unit_ equals **_1 000 cents_**. 

### Issues and limitations:
- It's preferable to consider the **precision beforehand**.
- It **complicates** the business logic of the application and introduces **error-prone** value **conversions** between units, micro-units and normal currency amounts that are presented to a user or external systems.
- Due to the _fact 7_ (_minor unit_ of a currency can change) or because of the need to add _additional precision_ you may need to **rescale** all values in the future.
- External systems you interact with can **misinterpret** the **magnitude** of an integer-represented
  value **after rescaling**:
  - 3rd-party services/customers which are not aware of the rescaling.
  - Your own services that can't be immediately updated with the new definitions of the currencies (limitation of the deployment process, caches).
  - A message queue, or an event streaming platform where you can't modify old messages during the rescaling process.
- This problem can be solved by **explicitly passing** the **scale** of a number everywhere along with the number.

### Suggested type: BigInt
It's a not-native data type that handles integers of arbitrary (or big enough) size and provides math operations on it. It's **the most suitable** way of storing _minor units_ or _micro units_. **Don't confuse** it with SQL bigint that in fact is _Int64_. 

Most of the [languages](https://en.wikipedia.org/wiki/List_of_arbitrary-precision_arithmetic_software) (
[JavaScript](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/BigInt),
[PHP](https://www.php.net/manual/en/book.bc.php),
[Go](https://pkg.go.dev/math/big),
[Python](https://rushter.com/blog/python-integer-implementation/),
[Java](https://docs.oracle.com/javase/7/docs/api/java/math/BigInteger.html),
[C#](https://learn.microsoft.com/en-us/dotnet/api/system.numerics.biginteger?view=net-7.0),
[C++](https://github.com/faheel/BigInt)
) support it natively or with 3rd-party libraries.
To store these values in **databases** you should use **Decimal** column type with `precision = 0` (
[SQL databases](https://www.sqlservertutorial.net/sql-server-basics/sql-server-decimal/),
[MongoDB](https://www.mongodb.com/developer/products/mongodb/bson-data-types-decimal128/)
).

For correct **(de)serialization** you will probably need to use **strings** for compatibility between different implementations. 

Usually, **more memory** is required by _BigInt_ type, compared to native integers, and computations take **longer** because CPUs don't have hardware support for this data type.

> Actually, it can depend on the **binary representation** of a value in a concrete implementation. 
> Normally, standard libraries provide optimal
> (`2^32`-base, or `2^64`-base) representation and have only constant overhead, while 3rd-party string-based
> ([C++](https://github.com/faheel/BigInt), [PHP](https://www.php.net/manual/en/book.bc.php)) types have linear
> overhead (due to `10`-base representation). In most databases the binary representation of _decimal_ type is not
> optimal (
> [100-base](https://www.oninit.com/manual/informix/100/dapip/dapip83.htm#sii-03-15209) or
> [10000-base](https://www.postgresql.org/message-id/16572.1091489720@sss.pgh.pa.us)).

### With some concerns: Int64
Some choose signed or unsigned **_Int64_** (also referenced as _BigInt_ in SQL, which can lead to confusion) for storing their cents or smaller subunits of currency. Even though it may seem to be sufficient for your use-case, I want to highlight the following **issues** with it:

- It may not be sufficient for storing minimal units of **cryptocurrencies** (see _fact 6_) or values with **extended precision** (see _requirement 5_).
- Some languages require casting to _Float64_ for math operations ([Go](https://pkg.go.dev/math)). The problem is _Float64_ has only 52 bits of mantissa; it's not enough to fit arbitrary _Int64_ value.
- **Not all** programming **languages support** _Int64_ values:
  - PHP running on x32 architectures cannot handle _Int64_ values.
  - Some languages (Java, PHP) do not support any unsigned integers.
  - JavaScript uses signed _Float64_ as an internal representation for the _number_ data type. It means that even if one can serialize _Int64_ numbers to JSON in their backend application, by default a JavaScript application will overflow its number type trying to deserialize JSON containing this value.

The problem with support of _Int64_ in external systems can be **mitigated** by serializing _Int64_ **to a string** and using _BigInt_ types to handle these values, but it reduces the benefits from using hardware-supported _Int64_ values.

> #### Int64 in JavaScript
> The problem with JavaScript numeric type is relevant if you use `JSON.parse()` and `JSON.stringify()` without
> additional arguments - as many "HTTP request" libraries do. If you have control over these calls you can pass custom
> [_replacer_](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/stringify)
> argument for `JSON.stringify()` and custom
> [_reviver_](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/parse)
> argument for
> [`JSON.parse()`](https://stackoverflow.com/questions/18755125/node-js-is-there-any-proper-way-to-parse-json-with-large-numbers-long-bigin)
> and manually handle **Int64** values using a data type different from default number.
>
> What could this "different" type be?
> - Built-in
> [BigInt64Array](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/BigInt64Array) type 
> - Built-in
> [BigInt](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/BigInt) type. Note, that it
> has limited math operations support.
> - 3rd-party [libraries](https://github.com/MikeMcl/bignumber.js/).

## 2️⃣ Decimal

This approach implies using a special _Decimal_ numeric type that allows to store **fractional decimal numbers** accurately with the specified precision (maximum precision differs in different databases).

Most [languages](https://en.wikipedia.org/wiki/List_of_arbitrary-precision_arithmetic_software) (
[JavaScript](https://github.com/MikeMcl/bignumber.js/),
[PHP](https://www.php.net/manual/en/book.gmp.php),
[Go](https://github.com/shopspring/decimal),
[Python](https://docs.python.org/3/library/decimal.html),
[Java](https://docs.oracle.com/javase/8/docs/api/java/math/BigDecimal.html),
[C#](https://learn.microsoft.com/en-us/dotnet/api/system.decimal?view=net-7.0),
[C++](https://stackoverflow.com/questions/14096026/c-decimal-data-types)
) have built-in support or 3rd-party libraries for handling this data type.
SQL databases offer own standard [Decimal](https://www.sqlservertutorial.net/sql-server-basics/sql-server-decimal/) 
type.

Note that there are **2 different types of decimal** type implementations:
- _**Decimal128**_ with limited number of significant digits ([MongoDB](https://www.mongodb.com/developer/products/mongodb/bson-data-types-decimal128/), [C#](https://learn.microsoft.com/en-us/dotnet/api/system.decimal?view=net-7.0)).
- So-called _**BigDecimal**_ type of arbitrary (or big enough) size (SQL Decimal, BigDecimal in Java) with different internal representations.

> As in the case of BigInt, the **binary representation** can differ:
> - 2 decimal digits in each byte (base 100, like it is done in databases).
> - _BigInt_ with exponent in a manner similar to base 2 floating point values.
> - Array or string of single decimal digits.

The **performance concerns** described above for _BigInt_ are relevant for _Decimal_ types as well.

The main **advantages** of using _Decimals_ comparing to _BigInts_ are:
- **No major overhead** if values are already stored as _Decimals_ in the database (you'll do it anyway even with _BigInts_). Also, formatting _BigInt_ values requires computations similar to those within _Decimal_ type.
- More **intuitive** representation of the values **simplifies** the business logic and formatting numbers to a human-readable format.
- Changing minor units can be done by altering the precision of the _decimal_ column in the database; you **don't have to rescale** the values.
- Value **serialized** to string naturally **includes** the information about **precision**. If you change the precision, it **cannot be misinterpreted** by external systems as in the case of _BigInts_.

As in the case of _BigInt_ values, all **serialization** goes through **decimal strings** for compatibility between different libraries. Of course, serializing in the form of mantissa + exponent can be more efficient for performance-sensitive applications.

However, you still need to keep track of minimal accountable units. Limiting the precision of _Decimal_ in the database requires remembering about **precision reserve** for intermediate operations and accumulators.

## Bad choice
### Float, Double

The first rule here is "[**never**](https://stackoverflow.com/questions/3730019/why-not-use-double-or-float-to-represent-currency) use floating-point data types for storing money amounts". Humans expect money calculations to be made in base 10, but [floating-point arithmetic](https://en.wikipedia.org/wiki/IEEE_754) uses base 2 representation that can lead to results that are not expected in financial sense. The common example to illustrate the problem is `0.1 + 0.2 != 0.3`. This rule is relevant for both programming languages and databases.

Even though decimal representation also can't store all amounts precisely (e.g. `1/3` - read bonus part at the end),
it's  expected by people, financial institutions and regulations.

### SQL Server MONEY
This proprietary type of Microsoft SQL Server stores amounts as _Int64_ internally and
[is not recommended](https://www.red-gate.com/hub/product-learning/sql-prompt/avoid-use-money-smallmoney-datatypes)
to use.

## Bonus: rational numbers
[Rational number](https://en.wikipedia.org/wiki/Rational_number) is a number that can be expressed as the **fraction** `A/B`. In most applications, their use is **not necessary**, however, for some use cases, they are the only option for obtaining the desired precision.

I can imagine a game or an expenses splitting application in which you need to take `1/3` of `10 $`, save it (to a database, message queue, or simply to memory) and later multiply it by `30`. Using **decimals** (both _Decimal_ type and _BigInt_ type with the number of cents) **can't provide exact precision** - the result will never be exactly `100`. But using rational numbers, you can save the intermediate value as `numerator = 10, denominator = 3` and later do simple arithmetic to get the value `100/1`.

Operations on **non-decimal units**, such as time and distance units, historical [non-decimal currencies](https://en.wikipedia.org/wiki/Non-decimal_currency), calculating probabilities, etc., may be candidates for introducing rational numbers when absolute precision is required.

There is standard [Fractions](https://docs.python.org/3/library/fractions.html) library in Python, 
[big.Rat](https://pkg.go.dev/math/big#Rat) in Go and 3rd-party libraries in other languages:
[JavaScript](https://github.com/infusion/Fraction.js/), 
[PHP](https://github.com/brick/math),
[C#](https://github.com/tompazourek/Rationals), 
[C++](https://www.boost.org/doc/libs/1_81_0/libs/rational/rational.html). 

Unfortunately, **the only database** I know to be supporting rational numbers is **PostgreSQL** with [pg_rational](https://github.com/begriffs/pg_rational) **extension**. Storing rational numbers in separate "numerator" and "denominator" columns limits the possibilities of math calculations directly in the database. 

## 👏 Thank you for reading

Any comments, criticism, and sharing of your own experience would be appreciated!