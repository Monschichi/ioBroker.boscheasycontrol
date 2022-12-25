![Logo](admin/boscheasycontrol.png)
# ioBroker.boscheasycontrol

[![pre-commit.ci status](https://results.pre-commit.ci/badge/github/Monschichi/ioBroker.boscheasycontrol/main.svg)](https://results.pre-commit.ci/latest/github/Monschichi/ioBroker.boscheasycontrol/main)
![Number of Installations](https://iobroker.live/badges/boscheasycontrol-installed.svg)

[![NPM](https://nodei.co/npm/ioBroker.boscheasycontrol.png?downloads=true)](https://nodei.co/npm/ioBroker.boscheasycontrol/)

**Tests:** ![Test and Release](https://github.com/Monschichi/ioBroker.boscheasycontrol/workflows/Test%20and%20Release/badge.svg)

## boscheasycontrol adapter for ioBroker

Integration of Bosch EasyControl CT200 devices.

Install on cammand line via: `iobroker url Monschichi/ioBroker.boscheasycontrol#v0.1.0` or via expert settings in the UI.

Add your serial, access key and password in adapter config.

As default all objects are created on adpater start, but none are updated. If you want object to update you can activate the refresh via the object specific custom settings.
Please keep in mind there is a rate limit on the API, so update only the needed objects in the needed intervals. Minimum interval is 1 second, default is 1 hour.

## Changelog
<!--
    Placeholder for the next version (at the beginning of the line):
    ### **WORK IN PROGRESS**
-->
### 0.1.0 (2022-12-04)
* (Monschichi) initial release

## License
MIT License

Copyright (c) 2022 Monschichi <monschichi@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
