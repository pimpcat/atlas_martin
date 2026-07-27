# -*- coding: utf-8 -*-
import arcpy, os, sys, gc
import threading
import subprocess

data_frame = 'PAGE_LAYOUT'
resolution = "200"
image_quality = "BEST"
colorspace = "CMYK"
compress_vectors = "True"
image_compression = "ADAPTIVE"
picture_symbol = 'RASTERIZE_PICTURE'
convert_markers = "False"
embed_fonts = "True"
layers_attributes = "NONE"
georef_info = "True"
jpeg_compression_quality = "100"

if len(sys.argv) >= 1:
    Ruta = sys.argv[0]
    Cve_Ent = sys.argv[1]
    Cve_Mun = sys.argv[2]
    Cve_Loc = sys.argv[3]
    ent = sys.argv[4]
    mun = sys.argv[5]
    loc = sys.argv[6]
    temp = sys.argv[7]
    Prod = sys.argv[8]
    

if Prod == "PLANORURAL":
    ws = os.path.join("D:\GEPROCEN\PDFS", Cve_Ent + " " + ent.replace("_", " "),
                           Cve_Mun + " " + mun.replace("_", " "), "PAR")
else:
    ws = os.path.join("D:\GEPROCEN\PDFS", Cve_Ent + " " + ent.replace("_", " "),
                           Cve_Mun + " " + mun.replace("_", " "), Cve_Loc + " " + loc.replace("_", " "))
if temp == "True":
    ws = os.path.join(ws,"temp")
print ws
map_folder = ws 
pdf_folder = ws

arcpy.env.workspace = map_folder  
arcpy.env.overwriteOutput = True  

# generate list of map documents in folder to loop through
map_list = arcpy.ListFiles("*.mxd")  

def exportAISMap(mxd_path, out_path):
    try:
        reload(arcpy)
        mxd = arcpy.mapping.MapDocument(r"" + mxd_path)  
        arcpy.mapping.ExportToPDF(mxd, r"" + out_path, data_frame, 640, 480, resolution,image_quality, colorspace, compress_vectors,image_compression, picture_symbol, convert_markers,embed_fonts, layers_attributes, georef_info, jpeg_compression_quality)  
        arcpy.RefreshActiveView()
        print "Exporta PDF: " + str(out_path) + "\n"   
        del mxd
        os.remove(mxd_path)
    except:
        print "Falla al generar PDF: " + str(out_path) + "\n"
        #python = sys.executable #Obtine script que se esta ejecutando actulmente
        #os.execl(python, python, * sys.argv) #Vuelve a ejecutar script
        
print "Total de Cartas: " + str(len(map_list)) + "\n"
try:   
    for map_file in map_list:
        map_folder = map_folder
        print "map_folder: " + map_folder
        mxd_path = os.path.join(str(map_folder), str(map_file))
        print "mxd_path: " + mxd_path
        pdf_file = map_file.replace(".mxd", ".pdf")
        pdf_path = os.path.join(str(pdf_folder), str(pdf_file))
        print "pdf_path: " + pdf_path
        p = threading.Thread(target=exportAISMap, args=(mxd_path, pdf_path))
        p.daemon = True
        p.start()
        p.join()
        break
##except IOError as e:
##    print "I/O error({0}): {1}".format(e.errno, e.strerror)
##    time.sleep(8)
##except ValueError as v:
##    print sys.exc_info()[0]
##    print "I/O error({0}): {1}".format(v.errno, v.strerror)
##    time.sleep(8)
except:
    print "Unexpected error:", sys.exc_info()[0]
    time.sleep(8)
    raise
