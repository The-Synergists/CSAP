-- Bid documents may be PDFs (read page by page by CSAP AI) as well as scans or photos.
update storage.buckets set allowed_mime_types = array['image/png', 'image/jpeg', 'application/pdf'] where id = 'bid-documents';
