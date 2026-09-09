# Local Personal DEV Speed Up

A terminal tool for DZO. Module-hosted CLI;

## Usage

```
dzo sync <hash>                 # type defaults to "tenders"
dzo sync <type> <hash>          # type is sent verbatim as type=
```

On success it prints the record URL and exits 0. If the server returns
`false`  it prints `false` and exits 1.

```
$ dzo sync 7a2cbf03808840c29991d84ce89b9931
http://dzo.lh/tenders/77160
```

### Options

| Flag | Meaning |
|---|---|
| `--base-url=<url>` | API base URL (default `http://dzo.lh`, env `DZO_BASE_URL`) |
| `--timeout=<sec>` | Request timeout in seconds (default `120`) |
| `--json` | Machine-readable output |
| `--quiet` | Suppress status messages on stderr |
| `-v`, `--version` | Print version |
| `-h`, `--help` | Show help |


### Exit codes

| Code | Meaning |
|---|---|
| 0 | Success — record URL printed |
| 1 | Server returned `false` |
| 2 | Response payload not recognized |
| 3 | Network failure, timeout, or non-2xx HTTP status |
| 64 | Usage error |

## `sql` module

Runs a templated SQL query on the stage DB over SSH + `docker exec` + `mysql`.
Host, container, credentials, and templates live in the git-ignored
`conf.json` (`ssh`, `db`, `sqlTemplates` keys) — never in source.

```
dzo sql <template> [name=value ...]
dzo sql --query=<sql>
```

```
$ dzo sql tender-id id=12345
+------+------------------+
| id   | token            |
+------+------------------+
| 12345 | 7a2cbf...       |
+------+------------------+
```

### Options

| Flag | Meaning |
|---|---|
| `--query=<sql>` | Run this SQL directly, bypassing templates |
| `--print` | Print the resolved ssh/mysql command (password redacted) and SQL, without connecting |
| `--ssh-host=<h>` | ssh host override (default: conf.json `ssh.host`, env `DZO_SSH_HOST`) |
| `--require-rows` | Exit 1 if the query returns zero rows |
| `--json` | Print rows as a JSON array instead of mysql's table |

Note: due to non-strict flag parsing, `--query` needs the `=` form
(`--query="SELECT 1"`), not a following space-separated argument.

### Exit codes

| Code | Meaning |
|---|---|
| 0 | Success — result printed |
| 1 | Zero rows returned and `--require-rows` was given |
| 3 | ssh/mysql failure |
| 64 | Usage error |

## Help

```
dzo                # overview
dzo help           # overview
dzo help sync      # full help for the sync module
dzo sync --help    # same
```