import importlib.util
import os
from pathlib import Path
import tempfile
import unittest
spec=importlib.util.spec_from_file_location('app',Path(__file__).with_name('configure-idrive-app.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class StageTest(unittest.TestCase):
 def setUp(self):
  self.t=tempfile.TemporaryDirectory();self.root=Path(self.t.name);self.app=self.root/'app.env';self.app.write_text('# preserve\nDATABASE_URL=synthetic\nOTHER_KEY=untouched\n');self.app.chmod(0o600);self.config=self.root/'credentials.json';m.m.save_new_config(self.config,'syntheticaccess123456','syntheticsecret1234567890');self.output=self.root/'next'
 def tearDown(self):self.t.cleanup()
 def test_stage_preserves_live_file_and_other_values(self):
  before=self.app.read_bytes();m.stage(self.output,self.app,self.config);self.assertEqual(self.app.read_bytes(),before);self.assertIn('OTHER_KEY=untouched',self.output.read_text());self.assertIn('SHOP_DOCUMENT_STORAGE=idrive',self.output.read_text());self.assertEqual(self.output.stat().st_mode&0o777,0o600)
 def test_no_overwrite_or_symlink(self):
  self.output.symlink_to(self.app)
  with self.assertRaises(OSError):m.stage(self.output,self.app,self.config)
  self.assertNotIn('SHOP_DOCUMENT_STORAGE',self.app.read_text())
 def test_existing_matching_configuration_stages_again_without_duplicate_keys(self):
  m.stage(self.output,self.app,self.config);other=self.root/'again';m.stage(other,self.output,self.config);self.assertEqual(other.read_bytes(),self.output.read_bytes())
 def test_foreign_or_ambiguous_config_is_rejected(self):
  for value in ['SHOP_DOCUMENT_STORAGE=other-provider\n','SHOP_IDRIVE_SECRET_ACCESS_KEY=foreign\n',' SHOP_DOCUMENT_STORAGE=idrive\n','SHOP_DOCUMENT_STORAGE=idrive\nSHOP_DOCUMENT_STORAGE=idrive\n']:
   self.app.write_text(value)
   with self.assertRaises(ValueError):m.stage(self.output,self.app,self.config)
   self.assertFalse(self.output.exists())
 def test_unsafe_files_fail_before_stage(self):
  self.app.chmod(0o644)
  with self.assertRaises(ValueError):m.stage(self.output,self.app,self.config)
  self.assertFalse(self.output.exists())
if __name__=='__main__':unittest.main()
