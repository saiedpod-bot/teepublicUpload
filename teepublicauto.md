Build a local-first TeePublic upload automation system composed of two main parts:

A localhost dashboard/web app
A Chrome extension upload manager with an automation engine

The system workflow should allow a user to upload:

an Excel/CSV metadata file
multiple design image files

The app must automatically:

parse the spreadsheet
match metadata rows with images using filename
validate all data
generate a normalized upload queue
preview all matched designs before upload

After validation, the user clicks “Start Upload”.

At that moment, the localhost app should send the entire upload queue directly to the Chrome extension using Chrome Runtime Messaging (not polling or background APIs).

The Chrome extension should:

receive the upload queue
store it locally
display all uploads in a queue interface
manage statuses
launch the TeePublic automation process

The extension UI should behave like an upload manager dashboard with:

image preview
title/details
upload status
upload controls
retry support
progress tracking

The upload queue must persist using chrome.storage.local so uploads survive browser restarts.

The upload engine should be modular and separated from the UI. The UI should only display data and controls, while all automation logic lives in dedicated services/modules.

The TeePublic automation flow should:

open the TeePublic upload page
upload the correct PNG file
fill title
fill tags
fill description
configure products/adult-content settings
publish the design
update queue status
continue to the next item

Use:

human-like delays
randomized waits
retry logic
safe sequential uploads

Avoid:

aggressive upload behavior
unstable selectors
coupling business logic with automation scripts

The localhost dashboard should act as the “brain” of the system:

import layer
validation layer
queue management
metadata normalization

The extension should act only as:

upload executor
queue renderer
automation runtime

Recommended stack:

Next.js + React + TailwindCSS for dashboard
Node.js backend
Chrome Extension Manifest V3
Chrome Runtime Messaging API
Chrome Storage API

The UI should have a clean modern SaaS-style design focused on batch upload management.

The final product should feel like a professional TeePublic upload manager capable of handling large batches safely and reliably.