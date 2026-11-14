Bundle Description for the Mars 2020 MOXIE Archive Bundle
=========================================================


PDS Release 8, November 2023 
==========================


Overview
========

The Mars 2020 MOXIE archive bundle includes all data taken by the Mars Oxygen
In-Situ Resource Utilization Experiment (MOXIE) instrument aboard the Mars 2020
Perseverance rover from sols 0-659. MOXIE is a demonstration of In-Situ Resource
Utilization (ISRU) technology, specifically, the production of oxygen via solid
oxide electrolysis of Mars' atmospheric carbon dioxide.

If you are unfamiliar with the data, the best place to begin is the Quick Start
Guide. You can find the Quick Start Guide in MOXIE_Data_Product_SIS_v5.0.pdf,
Section 1, located in the document folder.


Where to find data
==================

Data can be found in the directories data_raw/, data_calibrated/, and
data_derived/.

data_raw/ contains the original data from the instrument in Digital Numbers
(DNs), for example current sensor readings in DN.

data_calibrated/ contains the data converted to physical, Calibrated Units
(CUs), for example current sensor readings in A.

data_derived/ contains data derived from one or more calibrated or derived
quantities, for example oxygen mass production rate in g/hr.

Each of these directories contains subdirectories, one subdirectory per MOXIE
run. The subdirectories are named 0000, where 0000 is the sol number on
which the MOXIE run began.


Where to find documentation
===========================

Documentation can be found in the directory document/.

The document/ directory contains three PDF files. Users should consult the MOXIE
data product Software Interface Specification (SIS), which describes the raw,
calibrated, and derived data products in detail.

The bundle SIS describes the archive bundle at a high level.

The instrument paper (Hecht et al., 2021) describes MOXIE in detail.


Other directories
=================

The context/ directory contains pointers to the context information including
mission, spacecraft, instrument, and bundle descriptions.

The xml_schema/ directory contains pointers to all schemas used to generate the
Mars 2020 MOXIE bundle.
