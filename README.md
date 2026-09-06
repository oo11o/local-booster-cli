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

## Help

```
dzo                # overview
dzo help           # overview
dzo help sync      # full help for the sync module
dzo sync --help    # same
```