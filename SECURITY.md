# Security reports

Project Guilty Spark parses untrusted maps, archives, project JSON and images and can run explicitly configured local tools. Relevant reports include out-of-bounds or excessive-allocation parsing, archive traversal, source-file modification, command injection, unsafe tool selection and unintended network/data disclosure.

Use GitHub's **Report a vulnerability** option if the repository has private reporting enabled. Otherwise contact a maintainer using a publicly listed private channel to arrange disclosure. Private reporting has not been configured or verified by C33. Do not put working exploits against real users, tokens, private logs or proprietary maps in public issues. A minimal synthetic reproducer is preferred.

Include affected version/commit, host OS, trigger, expected boundary, observed impact and a safe reproduction. Only the current development version is actively maintained; there is no promised response SLA or security certification. Keep integrations and OS protections enabled. Older tools and imported archives are never trusted executable sources.
