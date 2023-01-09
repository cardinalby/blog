---
title: "Handling currency values: facts and best practices"
date: 2023-01-08
draft: false
categories:
- Best practices
tags:
- data-types
- computer-science
- db
image: "images/posts/best-practices/handling-currency-values/title.png"
---
## Intro
Repeatedly facing questions, debates and mistakes related to storing and representing currency amounts I decided to 
collect all facts and advice regarding this topic in one place. This article isn't the final source of the truth but
contains useful information you should take into considerations when you design software.

## Domain info: currencies

### Just facts:
- There is [ISO 4217](https://en.wikipedia.org/wiki/ISO_4217) standard describing currency codes and their minor units. 
Data is also available in XML and CSV representation (following the links from the [page](https://www.six-group.com/en/products-services/financial-information/data-standards.html))
1. A currency has a 3-letter code, a numeric-code and a name. A currency can have multiple listed locations.
2. Some currencies have exchange rate pegged (fixed) to another currency.
3. Minor units is the smallest unit of a currency, e.g. 1 dollar equals 100 cents (has 2 decimals).
4. Most currencies have 2 decimals. Some currencies do not have decimals, and some have 3 decimals.
5. [Mauritania](https://en.wikipedia.org/wiki/Mauritanian_ouguiya) and 
[Madagascar](https://en.wikipedia.org/wiki/Malagasy_ariary) does not use a decimal division of units, 
setting 1 _ouguiya_ = 5 _khoums_, _ariary_ = 5 _iraimbilanja_.
6. Cryptocurrencies can have up to 18 decimals ([_ETH_](https://beaconcha.in/tools/unitConverter))
7. The number of decimals [can](https://en.wikipedia.org/wiki/Ugandan_shilling) change over time due to inflation
8. The same can happen because of [redenomination](https://en.wikipedia.org/wiki/Redenomination) but a
new currency code should be introduced.
9. For some currencies there are no [physical denomination](https://en.wikipedia.org/wiki/Cash_rounding) for minor unit.
10. Storing prices of small units of goods (probably as a result of conversion from another currency) can require 
using more decimals than defined for a currency.

### Implications:
Storing a definition (spec) for a currency include the number of decimals it can have (precision): 
- Considering _fact 5_ it may not be enough, and you should store minimal _minimum accountable unit_ instead of or 
together with precision.
- Considering _fact 9_ if you deal with cash operations you may want to store _lowest physical denomination of 
the currency_.

## Data types
There are different data types that can technically store money values.

### DON'T: Float, Double
The first rule here is 
"[**never**](https://stackoverflow.com/questions/3730019/why-not-use-double-or-float-to-represent-currency) use 
floating-point data types for storing money amounts". Humans expect money calculations to be made in base 10, 
but [floating-point arithmetic](https://en.wikipedia.org/wiki/IEEE_754) uses base 2 representation that can lead to 
results that are not expected in financial sense. The common example to illustrate the problem is `0.1 + 0.2 != 0.3`.
This rule is relevant for both programming languages and databases.

### Integer number of minimal units
One of the popular [approaches](https://en.wikipedia.org/wiki/Fixed-point_arithmetic) is storing an integer 
number of minimal currency units. It means you store _5 $_ as 
_500 cents_. This way you can do accurate 
calculations and comparisons internally and then display the result formatting the number in a proper way as an amount 
of dollars. 

Probably, you need to go even further and add some precision reserve for intermediate operations and accumulators 
adding extra decimal places. This way, adding 2 extra decimal places turns _5 $_ into _50 000_ units. 
For example, it will allow you to accumulate a _10 %_ fee from 1 cent operations, sum them up until they reach 
_minimal accountable unit_ (cent) and withdraw from a client.

But this approach has some issues:
- You need to consider on the precision beforehand.
- Complicates the business logic of the application.
- Due to the _fact 7_ (minor unit of a currency can change) you may need to rescale all values in the future.
- If you expose API for 3rd-party services/customers and represent money amounts in this manner (like Stripe 
[does](https://stripe.com/docs/currencies#zero-decimal)) you must be sure that after rescaling your consumers 
immediately will be ready to understand the changed meaning of the numbers. This can be mitigated by passing the scale 
of a number everywhere along with the number itself. 

The most suitable data type for storing minor units is _**BigInt**_ (don't confuse with SQL bigint that means 
_Int64_) - a data type that handles integers of arbitrary (or big enough) size. Most of the languages (
[JavaScript](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/BigInt),
[PHP](https://www.php.net/manual/en/book.bc.php),
[Go](https://pkg.go.dev/math/big),
[Python](https://rushter.com/blog/python-integer-implementation/),
[Java](https://docs.oracle.com/javase/7/docs/api/java/math/BigInteger.html),
[C#](https://learn.microsoft.com/en-us/dotnet/api/system.numerics.biginteger?view=net-7.0)
) support it natively or in 3rd-party libraries.

To store these values in databases you should use _Decimal_ column type with `precision = 0` (
[SQL databases](https://www.sqlservertutorial.net/sql-server-basics/sql-server-decimal/),
[MongoDB](https://www.mongodb.com/developer/products/mongodb/bson-data-types-decimal128/)
). Note, that binary representation of a value differs from one in programming languages and requires
[more](https://www.oninit.com/manual/informix/100/dapip/dapip83.htm#sii-03-15209) space.

For correct (de)serialization you will need to use strings. Also, all computations will take longer
because modern processors don't have hardware support for these data type (unlike _Float64_ and _Int64_).

#### Int64 concerns
Many people choose signed or unsigned _Int64_ (also referenced as _BigInt_ in SQL which can lead to confusion) for 
storing their cents or even smaller subunits of currency. 

Even though at the first glance you can decide that it
has enough capacity for your use-case, I want to highlight the following **issues** with it:

- It may not be sufficient for storing minimal units of cryptocurrencies (see _fact 6_)
- Some programming languages require casting to _Float64_ for math operations ([Go](https://pkg.go.dev/math)).
The problem is _Float64_ has only 52 bits of mantissa; it's not enough to fit arbitrary _Int64_ value.
- Not all programming languages support _Int64_ values:
  - PHP running on x32 architectures can't handle _Int64_ values and none of unsigned types.
  - JavaScript uses signed _Float64_ as internal representation for _number_ data type. It means that even if you can 
    serialize _Int64_ number to JSON in your backend application, JavaScript application will
    overflow its number type trying to deserialize JSON containing this value.
  - These problems can be mitigated by serializing _Int64_ to string and use _BigInt_ libraries to handle these 
    values; but it reduces the benefits from using harware-supported _Int64_ values .

#### DONT: SQL Server MONEY
This proprietary type of Microsoft SQL Server store amounts as _Int64_ and 
[is not recommended](https://www.red-gate.com/hub/product-learning/sql-prompt/avoid-use-money-smallmoney-datatypes) 
to use.

## Decimal

The last feasible option (and my favorite) is using special _Decimal_ numeric type. As it was mentioned above, 
in databases it has a special binary representation that requires more space comparing with regular integers and 
doesn't have hardware support for computations. The representation allows to store decimal digits accurately 
with specified precision (maximum precision differs in different databases).

Most programming languages (
[JavaScript](https://github.com/MikeMcl/bignumber.js/),
[PHP](https://www.php.net/manual/en/book.gmp.php),
[Go](https://github.com/shopspring/decimal),
[Python](https://docs.python.org/3/library/decimal.html),
[Java](https://docs.oracle.com/javase/8/docs/api/java/math/BigDecimal.html),
[C#](https://learn.microsoft.com/en-us/dotnet/api/system.decimal?view=net-7.0)
) have built-in support or 3rd-party libraries for handling this data type, even though 
the internal implementations can differ:
- Storing 2 decimal digits in each byte (like it's done in databases)
- Storing _BigInt_ and exponent in the manner similar to base 2 floating point values
- Storing array of integers

The main advantages of using _Decimals_ are:
- No major overhead if values are already stored as _Decimals_ in the database (you are going to do it anyway even if
  you store _BigInts_).
- More logical and natural representation of the values. Even storing _BigInt_ values you will do computations 
  similar to ones inside _Decimal_ type to format the value.
- Changing of minor units can be done by altering the precision of _decimal_ column in the database; You don't have to
  rescale the values. It also excludes the problems with 3rd-party API consumers mentioned for integer numbers of 
  minor units.

As in case of _BigInt_ values all **serialization** goes through decimal strings for compatibility between different 
libraries, although there is more efficient way of serializing it as a struct containing mantissa as bytes array and
exponent as _Int32_ (remembering of limitations of using _Int64_). 

Also, you still need to keep track of minimal accountable units accepting and storing decimals. If you limit the 
precision of _Decimal_ in the database remember about **precision reserve** for intermediate operations and accumulators.