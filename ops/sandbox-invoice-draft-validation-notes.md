# Invoice draft inputs and number allocation

Sandbox invoices require a verified paid Mollie transaction, company and plan match, nonblank customer name/address, and EUR. Customer billing strings are trimmed. Sequence responses must contain a positive integer before an invoice number is assembled. The transaction must insert exactly one draft row to report success.

The development changes have not been executed in a test environment. No live deployment or payment is part of this block.
